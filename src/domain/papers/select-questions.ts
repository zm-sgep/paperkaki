/**
 * Question selector (M3-08 preview, M4-02 final).
 *
 * Picks questions for a blueprint so that every (topic, section) cell adds up
 * to EXACTLY its marks, with no repeated question or question family, using
 * only questions from the confirmed scope.
 *
 * Deterministic: the same blueprint, candidates, seed and avoid list always
 * give the same paper. Randomness comes only from a PRNG seeded by `seed`.
 *
 * Method (per attempt): cells are processed fewest-candidates first. For each
 * cell the candidates are ordered by a seeded weighted shuffle that favours
 * the difficulty still missing from the paper, interleaved across outcomes
 * for variety, with questions to avoid moved last. A bounded depth-first
 * search then finds an exact-sum subset; if a later cell cannot be filled
 * (usually because of family reuse) the search backtracks into earlier
 * cells, within a step budget. Up to 8 derived seeds are tried and the
 * attempt closest to the target difficulty mix wins.
 */
import type { Blueprint, BlueprintSection, SectionCode } from "@/domain/assessments/blueprint";
import { canFormSum } from "@/domain/assessments/validate-blueprint";
import type { Difficulty } from "@/schemas/question-content";
import { isEligible, type Candidate } from "./candidate";
import { rngFromSeed, shuffleInPlace } from "./prng";

export type SelectedQuestion = {
  questionId: string;
  sectionCode: SectionCode;
  topicId: string;
  marks: number;
  difficulty: Difficulty;
  number: number;
};

export type SelectionReport = {
  totalMarks: number;
  marksBySection: Record<SectionCode, number>;
  marksByTopic: Record<string, number>;
  /** Percent of marks by difficulty, one decimal place. */
  difficultyActual: Record<Difficulty, number>;
  /** How many selected questions were on the avoid list (0 unless unavoidable). */
  usedAvoided: number;
};

export type SelectionFailure = {
  code: "insufficient_inventory" | "no_exact_combination" | "invalid_blueprint";
  topicId?: string;
  sectionCode?: SectionCode;
  /** Developer-facing explanation. Not for parents. */
  detail: string;
};

export type SelectionResult =
  | { ok: true; selection: SelectedQuestion[]; report: SelectionReport }
  | { ok: false; failure: SelectionFailure };

export type SelectQuestionsInput = {
  blueprint: Blueprint;
  candidates: readonly Candidate[];
  seed: string;
  /** Questions from earlier papers of the same assessment; used only if unavoidable. */
  avoidQuestionIds?: readonly string[];
};

const DIFFICULTIES: readonly Difficulty[] = ["basic", "standard", "challenging"];
const DIFFICULTY_RANK: Record<Difficulty, number> = { basic: 0, standard: 1, challenging: 2 };
const ATTEMPTS = 8;
const CELL_STEP_LIMIT = 20_000;
const ATTEMPT_STEP_LIMIT = 100_000;
/** Keeps every difficulty reachable even when the target for it is already met. */
const MIN_DIFFICULTY_FRACTION = 0.02;

type Cell = {
  index: number;
  topicId: string;
  sectionCode: SectionCode;
  need: number;
  pool: Candidate[];
};

type Ctx = {
  families: Set<string>;
  marksByDifficulty: Record<Difficulty, number>;
  cellSteps: number;
  attemptSteps: number;
};

type Attempt = { picks: Candidate[][]; cells: Cell[]; usedAvoided: number; distance: number; index: number };

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const byQuestionId = (a: Candidate, b: Candidate): number => (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0);

function emptyDifficultyMarks(): Record<Difficulty, number> {
  return { basic: 0, standard: 0, challenging: 0 };
}

function invalid(detail: string): SelectionResult {
  return { ok: false, failure: { code: "invalid_blueprint", detail } };
}

function checkBlueprint(bp: Blueprint): string | undefined {
  if (bp.scope.length === 0) return "The blueprint has no topics.";
  const ids = new Set(bp.scope.map((s) => s.topicId));
  if (ids.size !== bp.scope.length) return "The blueprint lists a topic more than once.";
  let total = 0;
  for (const s of bp.scope) {
    for (const code of ["A", "B"] as const) {
      const m = s.sectionMarks[code];
      if (!Number.isInteger(m) || m < 0) return `Topic ${s.topicId} has invalid marks for section ${code}.`;
      total += m;
    }
  }
  if (total !== bp.totalMarks) return `Topic marks add up to ${total}, not ${bp.totalMarks}.`;
  if (!(bp.totalMarks > 0)) return "The blueprint has no marks.";
  return undefined;
}

function buildCells(bp: Blueprint, candidates: readonly Candidate[], excluded: ReadonlySet<string>): Cell[] {
  const seen = new Set<string>();
  const unique = candidates
    .filter((c) => (seen.has(c.questionId) ? false : (seen.add(c.questionId), true)))
    .filter((c) => !excluded.has(c.questionId))
    .sort(byQuestionId);
  const cells: Cell[] = [];
  for (const scope of bp.scope) {
    for (const section of bp.sections) {
      const need = scope.sectionMarks[section.code];
      if (need <= 0) continue;
      const pool = unique.filter((c) => c.marks <= need && isEligible(scope, bp.sections, section.code, c));
      cells.push({ index: cells.length, topicId: scope.topicId, sectionCode: section.code, need, pool });
    }
  }
  return cells;
}

/** Why the full request cannot work, judged cell by cell and ignoring families. */
function diagnose(cells: readonly Cell[]): SelectionFailure | undefined {
  for (const cell of cells) {
    const values = cell.pool.map((c) => c.marks);
    if (sum(values) < cell.need) {
      return {
        code: "insufficient_inventory",
        topicId: cell.topicId,
        sectionCode: cell.sectionCode,
        detail: `Topic ${cell.topicId} section ${cell.sectionCode} needs ${cell.need} marks but only ${sum(values)} are available.`,
      };
    }
  }
  for (const cell of cells) {
    if (!canFormSum(cell.pool.map((c) => c.marks), cell.need)) {
      return {
        code: "no_exact_combination",
        topicId: cell.topicId,
        sectionCode: cell.sectionCode,
        detail: `Topic ${cell.topicId} section ${cell.sectionCode} cannot make exactly ${cell.need} marks from the available mark values.`,
      };
    }
  }
  return undefined;
}

/**
 * Order a cell's pool: seeded weighted shuffle toward the missing difficulty,
 * round-robin across outcomes, questions to avoid last.
 */
function orderPool(cell: Cell, bp: Blueprint, ctx: Ctx, rng: () => number, avoid: ReadonlySet<string>): Candidate[] {
  const poolMarks = emptyDifficultyMarks();
  for (const c of cell.pool) poolMarks[c.difficulty] += c.marks;
  const poolTotal = sum(Object.values(poolMarks));

  const remaining = emptyDifficultyMarks();
  for (const d of DIFFICULTIES) {
    remaining[d] = Math.max(0, (bp.totalMarks * bp.difficulty[d]) / 100 - ctx.marksByDifficulty[d]);
  }
  const remainingTotal = sum(Object.values(remaining));
  const weight = (d: Difficulty): number => {
    const wanted = remainingTotal > 0 ? remaining[d] / remainingTotal : bp.difficulty[d] / 100;
    const share = poolMarks[d] / poolTotal;
    return Math.max(wanted, MIN_DIFFICULTY_FRACTION) / share;
  };

  const keyed = cell.pool.map((c) => ({ c, key: Math.log(rng() || Number.EPSILON) / weight(c.difficulty) }));
  keyed.sort((a, b) => (b.key !== a.key ? b.key - a.key : byQuestionId(a.c, b.c)));

  const groups = new Map<string, Candidate[]>();
  for (const { c } of keyed) {
    const list = groups.get(c.primaryOutcomeId);
    if (list) list.push(c);
    else groups.set(c.primaryOutcomeId, [c]);
  }
  const outcomeOrder = shuffleInPlace([...groups.keys()].sort(), rng);
  const interleaved: Candidate[] = [];
  for (let round = 0; interleaved.length < cell.pool.length; round += 1) {
    for (const o of outcomeOrder) {
      const c = groups.get(o)?.[round];
      if (c) interleaved.push(c);
    }
  }
  return [...interleaved.filter((c) => !avoid.has(c.questionId)), ...interleaved.filter((c) => avoid.has(c.questionId))];
}

/**
 * Lazily yields exact-sum subsets of `order` (best-preferred first) that avoid
 * families already on the paper. Families of the yielded subset stay reserved
 * until the consumer asks for the next one.
 */
function* cellSubsets(order: readonly Candidate[], need: number, ctx: Ctx): Generator<Candidate[]> {
  const n = order.length;
  const reach: boolean[][] = Array.from({ length: n + 1 }, () => new Array<boolean>(need + 1).fill(false));
  (reach[n] as boolean[])[0] = true;
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = (order[i] as Candidate).marks;
    const here = reach[i] as boolean[];
    const next = reach[i + 1] as boolean[];
    for (let r = 0; r <= need; r += 1) here[r] = next[r] === true || (m <= r && next[r - m] === true);
  }
  if ((reach[0] as boolean[])[need] !== true) return;

  const chosen: Candidate[] = [];
  function* dfs(start: number, remaining: number): Generator<Candidate[]> {
    if (remaining === 0) {
      yield chosen.slice();
      return;
    }
    for (let j = start; j < n; j += 1) {
      if ((reach[j] as boolean[])[remaining] !== true) return;
      ctx.cellSteps += 1;
      ctx.attemptSteps += 1;
      if (ctx.cellSteps > CELL_STEP_LIMIT || ctx.attemptSteps > ATTEMPT_STEP_LIMIT) return;
      const c = order[j] as Candidate;
      if (c.marks > remaining || ctx.families.has(c.familyId)) continue;
      ctx.families.add(c.familyId);
      chosen.push(c);
      yield* dfs(j + 1, remaining - c.marks);
      chosen.pop();
      ctx.families.delete(c.familyId);
    }
  }
  yield* dfs(0, need);
}

function distanceFromTarget(bp: Blueprint, picks: readonly Candidate[]): number {
  const marks = emptyDifficultyMarks();
  for (const c of picks) marks[c.difficulty] += c.marks;
  const total = sum(Object.values(marks));
  if (total === 0) return 0;
  return sum(DIFFICULTIES.map((d) => Math.abs((100 * marks[d]) / total - bp.difficulty[d])));
}

function runAttempt(
  bp: Blueprint,
  cells: readonly Cell[],
  derivedSeed: string,
  index: number,
  avoid: ReadonlySet<string>,
): Attempt | undefined {
  const ordered = [...cells].sort((a, b) => a.pool.length - b.pool.length || a.index - b.index);
  const ctx: Ctx = { families: new Set(), marksByDifficulty: emptyDifficultyMarks(), cellSteps: 0, attemptSteps: 0 };
  const picks: Candidate[][] = [];

  const solve = (ci: number): boolean => {
    if (ci === ordered.length) return true;
    const cell = ordered[ci] as Cell;
    const rng = rngFromSeed(`${derivedSeed}|${cell.topicId}|${cell.sectionCode}`);
    const order = orderPool(cell, bp, ctx, rng, avoid);
    ctx.cellSteps = 0;
    for (const subset of cellSubsets(order, cell.need, ctx)) {
      picks[ci] = subset;
      for (const c of subset) ctx.marksByDifficulty[c.difficulty] += c.marks;
      if (solve(ci + 1)) return true;
      for (const c of subset) ctx.marksByDifficulty[c.difficulty] -= c.marks;
      if (ctx.attemptSteps > ATTEMPT_STEP_LIMIT) return false;
    }
    return false;
  };

  if (!solve(0)) return undefined;
  const all = picks.flat();
  return {
    picks: picks.map((p) => [...p]),
    cells: ordered,
    usedAvoided: all.filter((c) => avoid.has(c.questionId)).length,
    distance: distanceFromTarget(bp, all),
    index,
  };
}

function bestAttempt(
  bp: Blueprint,
  cells: readonly Cell[],
  seed: string,
  avoid: ReadonlySet<string>,
  mode: string,
): Attempt | undefined {
  // Cheap necessary check: every cell must be able to reach its exact marks.
  for (const cell of cells) if (!canFormSum(cell.pool.map((c) => c.marks), cell.need)) return undefined;
  let best: Attempt | undefined;
  for (let k = 0; k < ATTEMPTS; k += 1) {
    const a = runAttempt(bp, cells, `${seed}#${mode}${k}`, k, avoid);
    if (!a) continue;
    if (
      !best ||
      a.usedAvoided < best.usedAvoided ||
      (a.usedAvoided === best.usedAvoided && a.distance < best.distance - 1e-9)
    ) {
      best = a;
    }
  }
  return best;
}

function assignNumbers(bp: Blueprint, attempt: Attempt): SelectedQuestion[] {
  const items: { sectionIndex: number; topicIndex: number; c: Candidate; code: SectionCode }[] = [];
  const topicIndex = new Map(bp.scope.map((s, i) => [s.topicId, i]));
  attempt.picks.forEach((cands, ci) => {
    const cell = attempt.cells[ci] as Cell;
    const sectionIndex = bp.sections.findIndex((s: BlueprintSection) => s.code === cell.sectionCode);
    for (const c of cands) {
      items.push({ sectionIndex, topicIndex: topicIndex.get(cell.topicId) ?? 0, c, code: cell.sectionCode });
    }
  });
  items.sort(
    (a, b) =>
      a.sectionIndex - b.sectionIndex ||
      a.topicIndex - b.topicIndex ||
      DIFFICULTY_RANK[a.c.difficulty] - DIFFICULTY_RANK[b.c.difficulty] ||
      byQuestionId(a.c, b.c),
  );
  return items.map((it, i) => ({
    questionId: it.c.questionId,
    sectionCode: it.code,
    topicId: it.c.topicId,
    marks: it.c.marks,
    difficulty: it.c.difficulty,
    number: i + 1,
  }));
}

function buildReport(bp: Blueprint, selection: readonly SelectedQuestion[], avoid: ReadonlySet<string>): SelectionReport {
  const marksBySection: Record<SectionCode, number> = { A: 0, B: 0 };
  const marksByTopic: Record<string, number> = Object.fromEntries(bp.scope.map((s) => [s.topicId, 0]));
  const byDifficulty = emptyDifficultyMarks();
  for (const q of selection) {
    marksBySection[q.sectionCode] += q.marks;
    marksByTopic[q.topicId] = (marksByTopic[q.topicId] ?? 0) + q.marks;
    byDifficulty[q.difficulty] += q.marks;
  }
  const totalMarks = sum(selection.map((q) => q.marks));
  const pct = (d: Difficulty): number => (totalMarks === 0 ? 0 : Math.round((1000 * byDifficulty[d]) / totalMarks) / 10);
  return {
    totalMarks,
    marksBySection,
    marksByTopic,
    difficultyActual: { basic: pct("basic"), standard: pct("standard"), challenging: pct("challenging") },
    usedAvoided: selection.filter((q) => avoid.has(q.questionId)).length,
  };
}

export function selectQuestions(input: SelectQuestionsInput): SelectionResult {
  const { blueprint: bp, candidates, seed } = input;
  const problem = checkBlueprint(bp);
  if (problem) return invalid(problem);

  const avoid = new Set(input.avoidQuestionIds ?? []);
  const none: ReadonlySet<string> = new Set();
  const fullCells = buildCells(bp, candidates, none);

  let best: Attempt | undefined;
  if (avoid.size > 0) {
    const cells = buildCells(bp, candidates, avoid);
    best = bestAttempt(bp, cells, seed, none, "x");
  }
  best ??= bestAttempt(bp, fullCells, seed, avoid, "f");

  if (!best) {
    const failure = diagnose(fullCells) ?? {
      code: "no_exact_combination" as const,
      detail: "No combination of questions fills every topic exactly without repeating a question family.",
    };
    return { ok: false, failure };
  }
  const selection = assignNumbers(bp, best);
  return { ok: true, selection, report: buildReport(bp, selection, avoid) };
}
