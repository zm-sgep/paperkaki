/**
 * Question selector (M3-08 preview, M4-02, format upgrade).
 *
 * Picks questions for a blueprint's paper format. Hard rules, always kept or the selector fails:
 *   - every part gets exactly its number of questions, of its kind, whose marks add up to exactly
 *     its total (and all equal its marks-each, when it has one);
 *   - every question is approved-and-in-scope (the caller passes only such candidates) and in the
 *     confirmed topics and outcomes;
 *   - no question twice, no question family twice on one paper;
 *   - every chosen topic appears at least once.
 * Soft goals, scored across attempts: topic marks balanced across the paper and spread over the
 * parts, difficulty close to the target, questions used in earlier mocks avoided, outcome variety.
 *
 * Deterministic: the same blueprint, candidates, seed and avoid list always give the same paper.
 * Randomness comes only from a PRNG seeded by `seed`.
 *
 * Method (per attempt): parts are filled scarcest first. For each part the candidates are ordered by
 * a seeded weighted shuffle that favours the difficulty still missing and the topics still short of
 * marks (or not on the paper yet), interleaved across outcomes for variety, with questions to avoid
 * moved last. A bounded depth-first search then finds an exact count-and-sum subset; if a later part
 * cannot be filled (family reuse, or a topic that would be left out) the search backtracks into
 * earlier parts, within a step budget. Several derived seeds are tried and the best scoring attempt wins.
 */
import { blueprintSections, type Blueprint, type BlueprintSection, type SectionCode } from "@/domain/assessments/blueprint";
import { formatQuestionCount, formatTotalMarks, validatePaperFormat } from "@/domain/assessments/paper-format";
import { canFormCountAndSum } from "@/domain/assessments/validate-blueprint";
import type { Difficulty } from "@/schemas/question-content";
import { candidatesForSection, type Candidate } from "./candidate";
import { rngFromSeed } from "./prng";

export type SelectedQuestion = {
  questionId: string;
  sectionCode: SectionCode;
  /** Position of the part in the format, 0 upward. */
  sectionIndex: number;
  topicId: string;
  marks: number;
  difficulty: Difficulty;
  number: number;
};

export type SectionReport = {
  code: SectionCode;
  label: string;
  questionCount: number;
  marks: number;
  marksByTopic: Record<string, number>;
};

export type SelectionReport = {
  totalMarks: number;
  marksBySection: Record<SectionCode, number>;
  marksByTopic: Record<string, number>;
  /** Percent of marks by difficulty, one decimal place. */
  difficultyActual: Record<Difficulty, number>;
  /** How many selected questions were on the avoid list (0 unless unavoidable). */
  usedAvoided: number;
  /** The same numbers part by part, in paper order. */
  sections: SectionReport[];
};

export type SelectionFailure = {
  code: "insufficient_inventory" | "no_exact_combination" | "invalid_blueprint" | "topic_not_covered";
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
  /**
   * A soft preference for some skills' questions (an adaptive mock leans towards weak skills and
   * skills due for review). A multiplier per primary outcome id; 1 or missing means none.
   */
  outcomeBoost?: Readonly<Record<string, number>>;
  /** Skills due for a spaced review: a paper that includes a question from each scores better. Soft. */
  dueOutcomeIds?: readonly string[];
};

/** What the soft preferences hold, in one place, so it travels through the search as one value. */
type Preferences = { boost: Readonly<Record<string, number>>; due: readonly string[] };

const DIFFICULTIES: readonly Difficulty[] = ["basic", "standard", "challenging"];
const DIFFICULTY_RANK: Record<Difficulty, number> = { basic: 0, standard: 1, challenging: 2 };
const ATTEMPTS = 8;
const PART_STEP_LIMIT = 20_000;
const ATTEMPT_STEP_LIMIT = 100_000;
/** Keeps every difficulty reachable even when the target for it is already met. */
const MIN_DIFFICULTY_FRACTION = 0.02;

/** Soft-goal weights. An avoided question outweighs everything else. */
const SCORE = { avoided: 10_000, difficulty: 1, topicBalance: 1.5, spread: 4, outcomeRepeat: 2, dueMissing: 6 } as const;
/** At most this many due skills are asked for, so retention stays a small share of the paper. */
const MAX_DUE_SKILLS = 3;

type Slot = { index: number; section: BlueprintSection; pool: Candidate[] };

type Ctx = {
  families: Set<string>;
  used: Set<string>;
  marksByDifficulty: Record<Difficulty, number>;
  marksByTopic: Map<string, number>;
  questionsByTopic: Map<string, number>;
  partSteps: number;
  attemptSteps: number;
};

type Attempt = { picks: Candidate[][]; slots: Slot[]; usedAvoided: number; score: number; index: number };

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
  const problems = validatePaperFormat(bp.format).filter((issue) => issue.code !== "total_out_of_range");
  if (problems[0]) return `The paper format is not valid: ${problems[0].message}`;
  if (formatTotalMarks(bp.format) !== bp.totalMarks) return `The parts add up to ${formatTotalMarks(bp.format)}, not ${bp.totalMarks}.`;
  if (!(bp.totalMarks > 0)) return "The blueprint has no marks.";
  return undefined;
}

function buildSlots(bp: Blueprint, candidates: readonly Candidate[], excluded: ReadonlySet<string>): Slot[] {
  const seen = new Set<string>();
  const unique = candidates
    .filter((c) => (seen.has(c.questionId) ? false : (seen.add(c.questionId), true)))
    .filter((c) => !excluded.has(c.questionId))
    .sort(byQuestionId);
  return blueprintSections(bp).map((section, index) => ({
    index,
    section,
    pool: candidatesForSection(bp.scope, section, unique),
  }));
}

/** Why the full request cannot work, judged part by part and topic by topic and ignoring families. */
function diagnose(bp: Blueprint, slots: readonly Slot[]): SelectionFailure | undefined {
  for (const slot of slots) {
    const values = slot.pool.map((c) => c.marks);
    const { section } = slot;
    if (values.length < section.questionCount || sum(values) < section.totalMarks) {
      return {
        code: "insufficient_inventory",
        sectionCode: section.code,
        detail: `Part ${section.code} (${section.label}) needs ${section.questionCount} ${section.kind} questions worth ${section.totalMarks} marks but only ${values.length} questions worth ${sum(values)} marks are available.`,
      };
    }
  }
  for (const slot of slots) {
    const { section } = slot;
    if (!canFormCountAndSum(slot.pool.map((c) => c.marks), section.questionCount, section.totalMarks)) {
      return {
        code: "no_exact_combination",
        sectionCode: section.code,
        detail: `Part ${section.code} (${section.label}) cannot make exactly ${section.totalMarks} marks from ${section.questionCount} questions with the available mark values.`,
      };
    }
  }
  for (const topic of bp.scope) {
    if (!slots.some((slot) => slot.pool.some((c) => c.topicId === topic.topicId))) {
      return {
        code: "topic_not_covered",
        topicId: topic.topicId,
        detail: `Topic ${topic.topicId} has no question that fits any part of the paper.`,
      };
    }
  }
  const capacity = formatQuestionCount(bp.format);
  const overflow = bp.scope[capacity];
  if (overflow) {
    return {
      code: "topic_not_covered",
      topicId: overflow.topicId,
      detail: `The paper has ${capacity} questions, fewer than the ${bp.scope.length} topics; topic ${overflow.topicId} cannot appear.`,
    };
  }
  return undefined;
}

function adjust(ctx: Ctx, picks: readonly Candidate[], sign: 1 | -1): void {
  for (const c of picks) {
    ctx.marksByDifficulty[c.difficulty] += sign * c.marks;
    ctx.marksByTopic.set(c.topicId, (ctx.marksByTopic.get(c.topicId) ?? 0) + sign * c.marks);
    ctx.questionsByTopic.set(c.topicId, (ctx.questionsByTopic.get(c.topicId) ?? 0) + sign);
    if (sign === 1) ctx.used.add(c.questionId);
    else ctx.used.delete(c.questionId);
  }
}

/**
 * Order a part's pool: seeded weighted shuffle toward the missing difficulty and the topics that
 * still need marks, then round-robin across outcomes, questions to avoid last.
 */
function orderPool(
  pool: readonly Candidate[],
  bp: Blueprint,
  ctx: Ctx,
  rng: () => number,
  avoid: ReadonlySet<string>,
  laterTopics: ReadonlySet<string>,
  prefs: Preferences,
): Candidate[] {
  const poolMarks = emptyDifficultyMarks();
  for (const c of pool) poolMarks[c.difficulty] += c.marks;
  const poolTotal = sum(Object.values(poolMarks));

  const remaining = emptyDifficultyMarks();
  for (const d of DIFFICULTIES) {
    remaining[d] = Math.max(0, (bp.totalMarks * bp.difficulty[d]) / 100 - ctx.marksByDifficulty[d]);
  }
  const remainingTotal = sum(Object.values(remaining));
  const difficultyWeight = (d: Difficulty): number => {
    const wanted = remainingTotal > 0 ? remaining[d] / remainingTotal : bp.difficulty[d] / 100;
    const share = poolMarks[d] / poolTotal;
    return Math.max(wanted, MIN_DIFFICULTY_FRACTION) / share;
  };

  const targets = new Map(bp.scope.map((s) => [s.topicId, s.targetMarks]));
  // Topic marks as the order is laid out, so a topic that has had its share is held back for a while.
  const simMarks = new Map(ctx.marksByTopic);
  const simCount = new Map(ctx.questionsByTopic);
  const topicWeight = (topicId: string): number => {
    const gap = (targets.get(topicId) ?? 0) - (simMarks.get(topicId) ?? 0);
    // A topic short of its marks is favoured; one that already has its share is held back.
    let weight = gap > 0 ? 1 + gap : 1 / (1 - gap);
    if ((simCount.get(topicId) ?? 0) === 0) weight *= laterTopics.has(topicId) ? 4 : 1000;
    return weight;
  };

  const keyed = pool.map((c) => ({ c, key: Math.log(rng() || Number.EPSILON) / (difficultyWeight(c.difficulty) * (prefs.boost[c.primaryOutcomeId] ?? 1)) }));
  keyed.sort((a, b) => (b.key !== a.key ? b.key - a.key : byQuestionId(a.c, b.c)));

  // Within a topic: outcome variety (the best of each outcome first, then the second best of each...).
  const perTopic = new Map<string, { c: Candidate; key: number }[]>();
  for (const item of keyed) {
    const list = perTopic.get(item.c.topicId);
    if (list) list.push(item);
    else perTopic.set(item.c.topicId, [item]);
  }
  for (const [topicId, list] of perTopic) {
    const seenPerOutcome = new Map<string, number>();
    const ranked = list.map((item, position) => {
      const rank = seenPerOutcome.get(item.c.primaryOutcomeId) ?? 0;
      seenPerOutcome.set(item.c.primaryOutcomeId, rank + 1);
      return { item, rank, position };
    });
    ranked.sort((x, y) => x.rank - y.rank || x.position - y.position);
    perTopic.set(topicId, ranked.map((r) => r.item));
  }

  // Lay the order out one question at a time, always taking the best head among the topics.
  const topicOrder = [...perTopic.keys()].sort();
  const ordered: Candidate[] = [];
  const heads = new Map<string, number>(topicOrder.map((t) => [t, 0]));
  while (ordered.length < pool.length) {
    let bestTopic: string | undefined;
    let bestScore = -Infinity;
    for (const topicId of topicOrder) {
      const head = perTopic.get(topicId)?.[heads.get(topicId) ?? 0];
      if (!head) continue;
      const score = head.key / topicWeight(topicId);
      if (score > bestScore) {
        bestScore = score;
        bestTopic = topicId;
      }
    }
    if (bestTopic === undefined) break;
    const index = heads.get(bestTopic) ?? 0;
    const picked = (perTopic.get(bestTopic) as { c: Candidate; key: number }[])[index] as { c: Candidate; key: number };
    heads.set(bestTopic, index + 1);
    ordered.push(picked.c);
    simMarks.set(bestTopic, (simMarks.get(bestTopic) ?? 0) + picked.c.marks);
    simCount.set(bestTopic, (simCount.get(bestTopic) ?? 0) + 1);
  }
  return [...ordered.filter((c) => !avoid.has(c.questionId)), ...ordered.filter((c) => avoid.has(c.questionId))];
}

/**
 * Lazily yields subsets of `order` (best-preferred first) with exactly `count` questions whose marks
 * add up to exactly `total`, avoiding families already on the paper. Families of the yielded subset
 * stay reserved until the consumer asks for the next one.
 */
type Cover = {
  /** Is this topic still missing from the paper? */
  isMissing: (topicId: string) => boolean;
  /** At least this many missing topics must come from this part (later parts cannot hold them all). */
  minNew: number;
  /** Missing topics no later part can bring: this part must include every one. */
  must: ReadonlySet<string>;
};

function* partSubsets(order: readonly Candidate[], count: number, total: number, ctx: Ctx, cover: Cover): Generator<Candidate[]> {
  const n = order.length;
  const stride = total + 1;
  const layer = (count + 1) * stride;
  // reach[i][k][r]: can questions i..n-1 supply exactly k questions worth r marks?
  const reach = new Uint8Array((n + 1) * layer);
  reach[n * layer] = 1;
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = (order[i] as Candidate).marks;
    for (let k = 0; k <= count; k += 1) {
      for (let r = 0; r <= total; r += 1) {
        const skip = reach[(i + 1) * layer + k * stride + r] === 1;
        const take = k >= 1 && m <= r && reach[(i + 1) * layer + (k - 1) * stride + (r - m)] === 1;
        if (skip || take) reach[i * layer + k * stride + r] = 1;
      }
    }
  }
  if (reach[count * stride + total] !== 1) return;

  const chosen: Candidate[] = [];
  const inChosen = new Map<string, number>();
  let newCovered = 0;
  let mustLeft = cover.must.size;
  function* dfs(start: number, left: number, remaining: number): Generator<Candidate[]> {
    if (left === 0) {
      if (remaining === 0 && newCovered >= cover.minNew && mustLeft === 0) yield chosen.slice();
      return;
    }
    if (newCovered + left < cover.minNew || mustLeft > left) return;
    for (let j = start; j < n; j += 1) {
      if (reach[j * layer + left * stride + remaining] !== 1) return;
      ctx.partSteps += 1;
      ctx.attemptSteps += 1;
      if (ctx.partSteps > PART_STEP_LIMIT || ctx.attemptSteps > ATTEMPT_STEP_LIMIT) return;
      const c = order[j] as Candidate;
      if (c.marks > remaining || ctx.families.has(c.familyId)) continue;
      const first = (inChosen.get(c.topicId) ?? 0) === 0;
      const isNew = first && cover.isMissing(c.topicId);
      const isMust = first && cover.must.has(c.topicId);
      // A pick that helps neither goal must leave enough places for both.
      if (newCovered + (isNew ? 1 : 0) + (left - 1) < cover.minNew) continue;
      if (mustLeft - (isMust ? 1 : 0) > left - 1) continue;
      ctx.families.add(c.familyId);
      chosen.push(c);
      inChosen.set(c.topicId, (inChosen.get(c.topicId) ?? 0) + 1);
      if (isNew) newCovered += 1;
      if (isMust) mustLeft -= 1;
      yield* dfs(j + 1, left - 1, remaining - c.marks);
      if (isMust) mustLeft += 1;
      if (isNew) newCovered -= 1;
      inChosen.set(c.topicId, (inChosen.get(c.topicId) ?? 1) - 1);
      chosen.pop();
      ctx.families.delete(c.familyId);
    }
  }
  yield* dfs(0, count, total);
}

/** Lower is better. Everything except `avoided` is a soft goal. */
function scoreAttempt(bp: Blueprint, slots: readonly Slot[], picks: readonly (readonly Candidate[])[], avoid: ReadonlySet<string>, prefs: Preferences): number {
  const all = picks.flat();
  const total = sum(all.map((c) => c.marks));
  const byDifficulty = emptyDifficultyMarks();
  for (const c of all) byDifficulty[c.difficulty] += c.marks;
  const difficultyDistance =
    total === 0 ? 0 : sum(DIFFICULTIES.map((d) => Math.abs((100 * byDifficulty[d]) / total - bp.difficulty[d])));

  const topicMarks = new Map<string, number>();
  const topicQuestions = new Map<string, number>();
  const topicSections = new Map<string, Set<number>>();
  const topicOutcomes = new Map<string, Set<string>>();
  picks.forEach((part, ci) => {
    const slot = slots[ci] as Slot;
    for (const c of part) {
      topicMarks.set(c.topicId, (topicMarks.get(c.topicId) ?? 0) + c.marks);
      topicQuestions.set(c.topicId, (topicQuestions.get(c.topicId) ?? 0) + 1);
      const inSections = topicSections.get(c.topicId) ?? new Set<number>();
      inSections.add(slot.index);
      topicSections.set(c.topicId, inSections);
      const outcomes = topicOutcomes.get(c.topicId) ?? new Set<string>();
      outcomes.add(c.primaryOutcomeId);
      topicOutcomes.set(c.topicId, outcomes);
    }
  });

  let balance = 0;
  let spread = 0;
  let repeats = 0;
  for (const topic of bp.scope) {
    balance += Math.abs((topicMarks.get(topic.topicId) ?? 0) - topic.targetMarks);
    const questions = topicQuestions.get(topic.topicId) ?? 0;
    spread += Math.max(0, Math.min(slots.length, questions) - (topicSections.get(topic.topicId)?.size ?? 0));
    repeats += Math.max(0, Math.min(questions, topic.outcomeIds.length) - (topicOutcomes.get(topic.topicId)?.size ?? 0));
  }
  const present = new Set(all.map((c) => c.primaryOutcomeId));
  const dueMissing = prefs.due.filter((id) => !present.has(id)).length;
  return (
    SCORE.dueMissing * dueMissing +
    SCORE.avoided * all.filter((c) => avoid.has(c.questionId)).length +
    SCORE.difficulty * difficultyDistance +
    SCORE.topicBalance * balance +
    SCORE.spread * spread +
    SCORE.outcomeRepeat * repeats
  );
}

function runAttempt(
  bp: Blueprint,
  slots: readonly Slot[],
  derivedSeed: string,
  index: number,
  avoid: ReadonlySet<string>,
  requireCoverage: boolean,
  prefs: Preferences,
): Attempt | undefined {
  const ordered = [...slots].sort(
    (a, b) => a.pool.length / a.section.questionCount - b.pool.length / b.section.questionCount || a.index - b.index,
  );
  const topicIds = bp.scope.map((s) => s.topicId);
  // Topics that a part after this one could still bring onto the paper.
  const later: Set<string>[] = ordered.map((_, ci) => {
    const set = new Set<string>();
    for (const slot of ordered.slice(ci + 1)) for (const c of slot.pool) set.add(c.topicId);
    return set;
  });
  const ctx: Ctx = {
    families: new Set(),
    used: new Set(),
    marksByDifficulty: emptyDifficultyMarks(),
    marksByTopic: new Map(),
    questionsByTopic: new Map(),
    partSteps: 0,
    attemptSteps: 0,
  };
  const picks: Candidate[][] = [];

  const solve = (ci: number): boolean => {
    if (ci === ordered.length) return true;
    const slot = ordered[ci] as Slot;
    const laterTopics = later[ci] as Set<string>;
    const rng = rngFromSeed(`${derivedSeed}|${slot.section.code}`);
    const available = slot.pool.filter((c) => !ctx.used.has(c.questionId) && !ctx.families.has(c.familyId));
    const order = orderPool(available, bp, ctx, rng, avoid, laterTopics, prefs);
    ctx.partSteps = 0;
    const missing = (topicId: string): boolean => (ctx.questionsByTopic.get(topicId) ?? 0) === 0;
    const uncovered = requireCoverage ? topicIds.filter(missing) : [];
    const laterCapacity = ordered.slice(ci + 1).reduce((total, later) => total + later.section.questionCount, 0);
    const cover: Cover = {
      isMissing: (topicId) => requireCoverage && missing(topicId),
      minNew: Math.max(0, uncovered.length - laterCapacity),
      must: new Set(uncovered.filter((topicId) => !laterTopics.has(topicId))),
    };
    for (const subset of partSubsets(order, slot.section.questionCount, slot.section.totalMarks, ctx, cover)) {
      picks[ci] = subset;
      adjust(ctx, subset, 1);
      if (solve(ci + 1)) return true;
      adjust(ctx, subset, -1);
      if (ctx.attemptSteps > ATTEMPT_STEP_LIMIT) return false;
    }
    return false;
  };

  if (!solve(0)) return undefined;
  const all = picks.flat();
  return {
    picks: picks.map((p) => [...p]),
    slots: ordered,
    usedAvoided: all.filter((c) => avoid.has(c.questionId)).length,
    score: scoreAttempt(bp, ordered, picks, avoid, prefs),
    index,
  };
}

function bestAttempt(
  bp: Blueprint,
  slots: readonly Slot[],
  seed: string,
  avoid: ReadonlySet<string>,
  mode: string,
  requireCoverage: boolean,
  prefs: Preferences,
): Attempt | undefined {
  // Cheap necessary check: every part must be able to reach its exact count and marks.
  for (const slot of slots) {
    if (!canFormCountAndSum(slot.pool.map((c) => c.marks), slot.section.questionCount, slot.section.totalMarks)) return undefined;
  }
  let best: Attempt | undefined;
  for (let k = 0; k < ATTEMPTS; k += 1) {
    const a = runAttempt(bp, slots, `${seed}#${mode}${k}`, k, avoid, requireCoverage, prefs);
    if (!a) continue;
    if (!best || a.score < best.score - 1e-9) best = a;
  }
  return best;
}

function assignNumbers(bp: Blueprint, attempt: Attempt): SelectedQuestion[] {
  const topicIndex = new Map(bp.scope.map((s, i) => [s.topicId, i]));
  const items: { sectionIndex: number; code: SectionCode; c: Candidate }[] = [];
  attempt.picks.forEach((cands, ci) => {
    const slot = attempt.slots[ci] as Slot;
    for (const c of cands) items.push({ sectionIndex: slot.index, code: slot.section.code, c });
  });
  items.sort(
    (a, b) =>
      a.sectionIndex - b.sectionIndex ||
      (topicIndex.get(a.c.topicId) ?? 0) - (topicIndex.get(b.c.topicId) ?? 0) ||
      DIFFICULTY_RANK[a.c.difficulty] - DIFFICULTY_RANK[b.c.difficulty] ||
      byQuestionId(a.c, b.c),
  );
  return items.map((it, i) => ({
    questionId: it.c.questionId,
    sectionCode: it.code,
    sectionIndex: it.sectionIndex,
    topicId: it.c.topicId,
    marks: it.c.marks,
    difficulty: it.c.difficulty,
    number: i + 1,
  }));
}

function buildReport(bp: Blueprint, selection: readonly SelectedQuestion[], avoid: ReadonlySet<string>): SelectionReport {
  const sections = blueprintSections(bp);
  const marksBySection: Record<SectionCode, number> = Object.fromEntries(sections.map((s) => [s.code, 0]));
  const marksByTopic: Record<string, number> = Object.fromEntries(bp.scope.map((s) => [s.topicId, 0]));
  const byDifficulty = emptyDifficultyMarks();
  for (const q of selection) {
    marksBySection[q.sectionCode] = (marksBySection[q.sectionCode] ?? 0) + q.marks;
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
    sections: sections.map((section) => {
      const chosen = selection.filter((q) => q.sectionCode === section.code);
      const byTopic: Record<string, number> = {};
      for (const q of chosen) byTopic[q.topicId] = (byTopic[q.topicId] ?? 0) + q.marks;
      return {
        code: section.code,
        label: section.label,
        questionCount: chosen.length,
        marks: sum(chosen.map((q) => q.marks)),
        marksByTopic: byTopic,
      };
    }),
  };
}

export function selectQuestions(input: SelectQuestionsInput): SelectionResult {
  const { blueprint: bp, candidates, seed } = input;
  const problem = checkBlueprint(bp);
  if (problem) return invalid(problem);

  const avoid = new Set(input.avoidQuestionIds ?? []);
  const none: ReadonlySet<string> = new Set();
  const prefs: Preferences = { boost: input.outcomeBoost ?? {}, due: [...(input.dueOutcomeIds ?? [])].sort().slice(0, MAX_DUE_SKILLS) };
  const fullSlots = buildSlots(bp, candidates, none);

  let best: Attempt | undefined;
  if (avoid.size > 0) {
    best = bestAttempt(bp, buildSlots(bp, candidates, avoid), seed, none, "x", true, prefs);
  }
  best ??= bestAttempt(bp, fullSlots, seed, avoid, "f", true, prefs);

  if (!best) {
    const known = diagnose(bp, fullSlots);
    if (known) return { ok: false, failure: known };
    // Everything is reachable part by part: is it the "every topic appears" rule that blocks?
    const relaxed = bestAttempt(bp, fullSlots, seed, avoid, "r", false, prefs);
    if (relaxed) {
      const present = new Set(relaxed.picks.flat().map((c) => c.topicId));
      const missing = bp.scope.find((s) => !present.has(s.topicId));
      if (missing) {
        return {
          ok: false,
          failure: {
            code: "topic_not_covered",
            topicId: missing.topicId,
            detail: `No paper of this format can include topic ${missing.topicId} without breaking another rule.`,
          },
        };
      }
    }
    return {
      ok: false,
      failure: { code: "no_exact_combination", detail: "No combination of questions fills every part exactly without repeating a question family." },
    };
  }
  const selection = assignNumbers(bp, best);
  return { ok: true, selection, report: buildReport(bp, selection, avoid) };
}
