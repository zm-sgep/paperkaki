/**
 * Which questions make up one practice set (M9). Pure and deterministic: the same candidates, history,
 * focus and seed always give the same set. Randomness comes only from a PRNG seeded by `seed`.
 *
 * Rules, in the order they matter:
 *  1. Only the candidates passed in are used, and the application passes approved questions only.
 *  2. A set is about 15 minutes: at least 6 and at most 10 questions, stopping once the estimated time is used.
 *  3. Questions the child answered correctly recently are left out (unless nothing else is left).
 *  4. Questions the child has not seen come first, then ones they got wrong (a retry), then old right ones.
 *  5. Time is shared between the skills in the focus by need: weak and due skills get more questions.
 *  6. No two questions from one family (unless the pool has run out of families).
 *  7. Harder questions are only offered where the skill is far enough along; the set warms up from easier to harder.
 */
import { MASTERY_STATE_RANK, type MasteryState } from "@/domain/mastery";
import type { Difficulty, QuestionType } from "@/schemas/question-content";
import { rngFromSeed } from "@/domain/papers/prng";

export const PRACTICE_MIN_QUESTIONS = 6;
export const PRACTICE_MAX_QUESTIONS = 10;
/** Practice set length in seconds (15 minutes). */
export const PRACTICE_TIME_BUDGET_SECONDS = 15 * 60;
/** A question answered fully right within this many days is not asked again while others are available. */
export const RECENT_CORRECT_DAYS = 14;

const DAY_MS = 86_400_000;

export type PracticeCandidate = {
  questionId: string;
  familyId: string;
  outcomeId: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  marks: number;
  estimatedSeconds: number;
};

/** What the child last did with a question, from mock and practice evidence. */
export type QuestionHistory = {
  questionId: string;
  /** ISO 8601. */
  lastAnsweredAt: string;
  /** 0..1. */
  lastScoreRatio: number;
};

/** One skill to draw from, with the state it is in. */
export type PracticeFocusOutcome = {
  outcomeId: string;
  state: MasteryState;
  /** ISO 8601. A secure skill whose spaced review is due is worth more time. */
  reviewDueAt?: string;
};

/** How much of the set a skill deserves. Weak first, secure skills only when a review is due. */
export function outcomeNeed(outcome: PracticeFocusOutcome, now: string): number {
  switch (outcome.state) {
    case "learning":
      return 3;
    case "developing":
      return 2.5;
    case "not_started":
      return 2;
    case "almost_mastered":
      return 1.5;
    case "mastered":
    case "retained":
      return outcome.reviewDueAt !== undefined && Date.parse(outcome.reviewDueAt) <= Date.parse(now) ? 1.5 : 0.4;
  }
}

/** How much a question of this difficulty suits a skill in this state (appropriate challenge, not the hardest). */
export function difficultyFit(state: MasteryState, difficulty: Difficulty): number {
  const table: Record<"early" | "middle" | "late", Record<Difficulty, number>> = {
    early: { basic: 3, standard: 2, challenging: 0.25 },
    middle: { basic: 1.5, standard: 3, challenging: 1 },
    late: { basic: 0.5, standard: 2, challenging: 3 },
  };
  const rank = MASTERY_STATE_RANK[state];
  return table[rank <= MASTERY_STATE_RANK.learning ? "early" : rank <= MASTERY_STATE_RANK.developing ? "middle" : "late"][difficulty];
}

const DIFFICULTY_RANK: Record<Difficulty, number> = { basic: 0, standard: 1, challenging: 2 };

/** 0 = unseen, 1 = seen and got wrong, 2 = got right long ago, 3 = got right recently. */
export function freshness(history: QuestionHistory | undefined, now: string): 0 | 1 | 2 | 3 {
  if (!history) return 0;
  if (history.lastScoreRatio < 1) return 1;
  return Date.parse(now) - Date.parse(history.lastAnsweredAt) < RECENT_CORRECT_DAYS * DAY_MS ? 3 : 2;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type PracticeSetInput = {
  candidates: readonly PracticeCandidate[];
  focus: readonly PracticeFocusOutcome[];
  history: readonly QuestionHistory[];
  /** ISO 8601. */
  now: string;
  seed: string;
  /** Questions the set must not contain (already in this set). */
  excludeQuestionIds?: readonly string[];
  /** Ask for exactly this many questions instead of a full set ("one like this"). */
  count?: number;
};

export type PracticeSet = { questionIds: string[]; outcomeIds: string[] };

/** Weighted shuffle key: a higher key comes first; a larger weight makes a high key likelier. */
function shuffleKey(rng: () => number, weight: number): number {
  return Math.log(rng() || Number.EPSILON) / Math.max(weight, 1e-6);
}

export function selectPracticeQuestions(input: PracticeSetInput): PracticeSet {
  const rng = rngFromSeed(input.seed);
  const excluded = new Set(input.excludeQuestionIds ?? []);
  const historyOf = new Map(input.history.map((entry) => [entry.questionId, entry]));
  const stateOf = new Map(input.focus.map((outcome) => [outcome.outcomeId, outcome]));

  // Only questions of the focus, each once, in a stable order.
  const seen = new Set<string>();
  const pool = input.candidates
    .filter((candidate) => stateOf.has(candidate.outcomeId) && !excluded.has(candidate.questionId) && !seen.has(candidate.questionId) && (seen.add(candidate.questionId), true))
    .sort((a, b) => byText(a.questionId, b.questionId));

  // Rank each question once: freshness first (a lower tier always comes first), then a seeded weighted shuffle.
  const ranked = pool.map((candidate) => {
    const focus = stateOf.get(candidate.outcomeId) as PracticeFocusOutcome;
    return {
      candidate,
      tier: freshness(historyOf.get(candidate.questionId), input.now),
      key: shuffleKey(rng, difficultyFit(focus.state, candidate.difficulty)),
    };
  });
  ranked.sort((a, b) => a.tier - b.tier || b.key - a.key || byText(a.candidate.questionId, b.candidate.questionId));

  const perOutcome = new Map<string, typeof ranked>();
  for (const entry of ranked) {
    const list = perOutcome.get(entry.candidate.outcomeId);
    if (list) list.push(entry);
    else perOutcome.set(entry.candidate.outcomeId, [entry]);
  }

  const chosen: PracticeCandidate[] = [];
  const families = new Set<string>();
  const taken = new Map<string, number>();
  let seconds = 0;
  const minimum = input.count ?? PRACTICE_MIN_QUESTIONS;
  const enough = () =>
    input.count !== undefined
      ? chosen.length >= input.count
      : chosen.length >= PRACTICE_MAX_QUESTIONS || (chosen.length >= PRACTICE_MIN_QUESTIONS && seconds >= PRACTICE_TIME_BUDGET_SECONDS);

  // Two passes: first with no repeated family and nothing answered right recently, up to a full set; then,
  // only if that left the set short of its minimum, whatever else there is.
  for (const strict of [true, false]) {
    const full = () => (strict ? enough() : chosen.length >= minimum);
    while (!full()) {
      let bestOutcome: string | undefined;
      let bestScore = -Infinity;
      let bestEntry: (typeof ranked)[number] | undefined;
      for (const outcomeId of [...perOutcome.keys()].sort(byText)) {
        const entry = (perOutcome.get(outcomeId) ?? []).find(
          (item) =>
            !chosen.includes(item.candidate) &&
            (!strict || (item.tier < 3 && !families.has(item.candidate.familyId))),
        );
        if (!entry) continue;
        const need = outcomeNeed(stateOf.get(outcomeId) as PracticeFocusOutcome, input.now);
        // Share the set by need: the skill furthest behind its share goes next.
        const score = need / ((taken.get(outcomeId) ?? 0) + 1);
        if (score > bestScore) {
          bestScore = score;
          bestOutcome = outcomeId;
          bestEntry = entry;
        }
      }
      if (!bestEntry || bestOutcome === undefined) break;
      chosen.push(bestEntry.candidate);
      families.add(bestEntry.candidate.familyId);
      taken.set(bestOutcome, (taken.get(bestOutcome) ?? 0) + 1);
      seconds += bestEntry.candidate.estimatedSeconds;
    }
    if (enough()) break;
  }

  // Warm up: easier first, then harder, keeping the skills mixed within each step.
  const order = new Map(chosen.map((candidate, index) => [candidate.questionId, index]));
  chosen.sort(
    (a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || (order.get(a.questionId) as number) - (order.get(b.questionId) as number),
  );
  return { questionIds: chosen.map((candidate) => candidate.questionId), outcomeIds: chosen.map((candidate) => candidate.outcomeId) };
}

/**
 * One more question like the one just answered: the same skill, a different family and a different
 * question from any already in the set. Prefers a question not seen before. Null when there is none.
 */
export function selectSimilarQuestion(input: {
  candidates: readonly PracticeCandidate[];
  outcomeId: string;
  /** The families already in this set (the question that was just answered included). */
  avoidFamilyIds: readonly string[];
  usedQuestionIds: readonly string[];
  state: MasteryState;
  history: readonly QuestionHistory[];
  now: string;
  seed: string;
}): string | null {
  const avoidFamilies = new Set(input.avoidFamilyIds);
  const candidates = input.candidates.filter((candidate) => !avoidFamilies.has(candidate.familyId));
  const picked = selectPracticeQuestions({
    candidates,
    focus: [{ outcomeId: input.outcomeId, state: input.state }],
    history: input.history,
    now: input.now,
    seed: input.seed,
    excludeQuestionIds: input.usedQuestionIds,
    count: 1,
  });
  const id = picked.questionIds[0];
  if (id === undefined) return null;
  // Never offer something the child got right recently as "one like this": a new question or none.
  const history = input.history.find((entry) => entry.questionId === id);
  return freshness(history, input.now) === 3 ? null : id;
}
