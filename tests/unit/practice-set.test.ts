import { describe, expect, it } from "vitest";
import {
  PRACTICE_MAX_QUESTIONS,
  PRACTICE_MIN_QUESTIONS,
  RECENT_CORRECT_DAYS,
  difficultyFit,
  freshness,
  outcomeNeed,
  selectPracticeQuestions,
  selectSimilarQuestion,
  type PracticeCandidate,
  type PracticeFocusOutcome,
  type QuestionHistory,
} from "@/domain/recommendations";

const NOW = "2026-10-01T02:00:00.000Z";
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

let n = 0;
function question(over: Partial<PracticeCandidate> = {}): PracticeCandidate {
  n += 1;
  return {
    questionId: `q${String(n).padStart(3, "0")}`,
    familyId: `f${n}`,
    outcomeId: "len",
    questionType: "number",
    difficulty: "standard",
    marks: 2,
    estimatedSeconds: 100,
    ...over,
  };
}
const many = (count: number, over: Partial<PracticeCandidate> = {}) => Array.from({ length: count }, () => question(over));
const focus = (outcomeId: string, state: PracticeFocusOutcome["state"] = "developing", reviewDueAt?: string): PracticeFocusOutcome => ({
  outcomeId,
  state,
  ...(reviewDueAt ? { reviewDueAt } : {}),
});
const pick = (over: Partial<Parameters<typeof selectPracticeQuestions>[0]> & { candidates: PracticeCandidate[] }) =>
  selectPracticeQuestions({ focus: [focus("len")], history: [], now: NOW, seed: "seed-1", ...over });

describe("practice set selection (M9)", () => {
  it("makes a set of 6 to 10 questions that fits about 15 minutes", () => {
    const set = pick({ candidates: many(30, { estimatedSeconds: 100 }) });
    expect(set.questionIds.length).toBeGreaterThanOrEqual(PRACTICE_MIN_QUESTIONS);
    expect(set.questionIds.length).toBeLessThanOrEqual(PRACTICE_MAX_QUESTIONS);
    expect(set.questionIds).toHaveLength(9);
    const long = pick({ candidates: many(30, { estimatedSeconds: 400 }) });
    expect(long.questionIds).toHaveLength(PRACTICE_MIN_QUESTIONS);
    const short = pick({ candidates: many(30, { estimatedSeconds: 30 }) });
    expect(short.questionIds).toHaveLength(PRACTICE_MAX_QUESTIONS);
  });

  it("is deterministic for the same input and changes with the seed", () => {
    const candidates = many(30);
    expect(pick({ candidates }).questionIds).toEqual(pick({ candidates }).questionIds);
    expect(pick({ candidates, seed: "other" }).questionIds).not.toEqual(pick({ candidates }).questionIds);
  });

  it("uses only the questions it was given, of the skills in the focus, each once", () => {
    const candidates = [...many(12, { outcomeId: "len" }), ...many(12, { outcomeId: "mass" })];
    const duplicate = candidates[0] as PracticeCandidate;
    const set = pick({ candidates: [...candidates, duplicate] });
    const ids = new Set(candidates.map((c) => c.questionId));
    expect(set.questionIds.every((id) => ids.has(id))).toBe(true);
    expect(new Set(set.questionIds).size).toBe(set.questionIds.length);
    expect(set.outcomeIds.every((id) => id === "len")).toBe(true);
  });

  it("leaves out what the child got right recently, but brings it back rather than fall short", () => {
    const candidates = many(20);
    const recentlyRight: QuestionHistory[] = candidates.slice(0, 10).map((c) => ({ questionId: c.questionId, lastAnsweredAt: daysAgo(2), lastScoreRatio: 1 }));
    const set = pick({ candidates, history: recentlyRight });
    const banned = new Set(recentlyRight.map((h) => h.questionId));
    expect(set.questionIds.some((id) => banned.has(id))).toBe(false);

    const few = many(4);
    const all: QuestionHistory[] = few.map((c) => ({ questionId: c.questionId, lastAnsweredAt: daysAgo(1), lastScoreRatio: 1 }));
    expect(pick({ candidates: few, history: all }).questionIds).toHaveLength(4);
  });

  it("asks unseen questions first, then ones answered wrongly, then old right ones", () => {
    const unseen = many(3);
    const wrong = many(3);
    const oldRight = many(3);
    const history: QuestionHistory[] = [
      ...wrong.map((c) => ({ questionId: c.questionId, lastAnsweredAt: daysAgo(1), lastScoreRatio: 0 })),
      ...oldRight.map((c) => ({ questionId: c.questionId, lastAnsweredAt: daysAgo(RECENT_CORRECT_DAYS + 5), lastScoreRatio: 1 })),
    ];
    const set = pick({ candidates: [...oldRight, ...wrong, ...unseen], history });
    const tierOf = (id: string) => (unseen.some((c) => c.questionId === id) ? 0 : wrong.some((c) => c.questionId === id) ? 1 : 2);
    const chosenTiers = set.questionIds.map(tierOf);
    expect(chosenTiers.filter((tier) => tier === 0)).toHaveLength(3);
    expect(chosenTiers.filter((tier) => tier === 1)).toHaveLength(3);
    expect(chosenTiers.filter((tier) => tier === 2)).toHaveLength(3);
    // And with room for only six, the old right ones are the ones dropped.
    const six = pick({ candidates: [...oldRight, ...wrong, ...unseen].map((c) => ({ ...c, estimatedSeconds: 400 })), history });
    expect(six.questionIds.map(tierOf).sort()).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it("does not repeat a family while others are available", () => {
    const shared = many(5, { familyId: "same" });
    const others = many(8);
    const set = pick({ candidates: [...shared, ...others] });
    const families = set.questionIds.map((id) => [...shared, ...others].find((c) => c.questionId === id)?.familyId);
    expect(families.filter((family) => family === "same")).toHaveLength(1);
    // With only one family there is nothing else to use.
    expect(pick({ candidates: many(8, { familyId: "only" }) }).questionIds).toHaveLength(PRACTICE_MIN_QUESTIONS);
  });

  it("shares the set between skills by need: the weak skill gets the most, a secure one the least", () => {
    const candidates = [...many(20, { outcomeId: "weak" }), ...many(20, { outcomeId: "mid" }), ...many(20, { outcomeId: "secure" })];
    const set = pick({ candidates, focus: [focus("weak", "learning"), focus("mid", "almost_mastered"), focus("secure", "mastered")] });
    const count = (id: string) => set.outcomeIds.filter((outcomeId) => outcomeId === id).length;
    expect(count("weak")).toBeGreaterThan(count("mid"));
    expect(count("mid")).toBeGreaterThanOrEqual(count("secure"));
    expect(count("weak")).toBeGreaterThanOrEqual(4);
    expect(count("mid")).toBeGreaterThanOrEqual(1);
  });

  it("gives a secure skill more time only when its spaced review is due", () => {
    const now = { state: "mastered" as const };
    expect(outcomeNeed({ outcomeId: "a", ...now }, NOW)).toBeLessThan(outcomeNeed({ outcomeId: "a", ...now, reviewDueAt: daysAgo(1) }, NOW));
    expect(outcomeNeed({ outcomeId: "a", ...now, reviewDueAt: daysAgo(-3) }, NOW)).toBe(outcomeNeed({ outcomeId: "a", ...now }, NOW));
    expect(outcomeNeed({ outcomeId: "a", state: "learning" }, NOW)).toBeGreaterThan(outcomeNeed({ outcomeId: "a", state: "almost_mastered" }, NOW));
  });

  it("matches challenge to where the skill is, and warms up from easier to harder", () => {
    expect(difficultyFit("learning", "basic")).toBeGreaterThan(difficultyFit("learning", "challenging"));
    expect(difficultyFit("almost_mastered", "challenging")).toBeGreaterThan(difficultyFit("almost_mastered", "basic"));
    const candidates = [...many(10, { difficulty: "basic" }), ...many(10, { difficulty: "standard" }), ...many(10, { difficulty: "challenging" })];
    const set = pick({ candidates });
    const rank = { basic: 0, standard: 1, challenging: 2 } as const;
    const difficulties = set.questionIds.map((id) => rank[candidates.find((c) => c.questionId === id)!.difficulty]);
    expect(difficulties).toEqual([...difficulties].sort((a, b) => a - b));
  });

  it("returns an empty set when there is nothing in the focus, and honours an exact count", () => {
    expect(pick({ candidates: many(5, { outcomeId: "other" }) }).questionIds).toEqual([]);
    expect(pick({ candidates: many(20), count: 3 }).questionIds).toHaveLength(3);
  });

  it("never picks a question that is excluded", () => {
    const candidates = many(20);
    const banned = candidates.slice(0, 10).map((c) => c.questionId);
    const set = pick({ candidates, excludeQuestionIds: banned });
    expect(set.questionIds.some((id) => banned.includes(id))).toBe(false);
  });

  it("classifies freshness", () => {
    expect(freshness(undefined, NOW)).toBe(0);
    expect(freshness({ questionId: "q", lastAnsweredAt: daysAgo(1), lastScoreRatio: 0.5 }, NOW)).toBe(1);
    expect(freshness({ questionId: "q", lastAnsweredAt: daysAgo(RECENT_CORRECT_DAYS + 1), lastScoreRatio: 1 }, NOW)).toBe(2);
    expect(freshness({ questionId: "q", lastAnsweredAt: daysAgo(1), lastScoreRatio: 1 }, NOW)).toBe(3);
  });
});

describe("one like this", () => {
  const base = () => {
    const current = question({ familyId: "fam-current" });
    const sameFamily = question({ familyId: "fam-current" });
    const other = question({ familyId: "fam-other" });
    return { current, sameFamily, other };
  };

  it("offers the same skill from a different family, never one already in the set", () => {
    const { current, sameFamily, other } = base();
    const id = selectSimilarQuestion({
      candidates: [current, sameFamily, other],
      outcomeId: "len",
      avoidFamilyIds: ["fam-current"],
      usedQuestionIds: [current.questionId],
      state: "developing",
      history: [],
      now: NOW,
      seed: "s",
    });
    expect(id).toBe(other.questionId);
  });

  it("offers nothing when the only other questions are the same family, already used, or answered right recently", () => {
    const { current, sameFamily, other } = base();
    const input = { outcomeId: "len", avoidFamilyIds: ["fam-current"], usedQuestionIds: [current.questionId], state: "developing" as const, now: NOW, seed: "s" };
    expect(selectSimilarQuestion({ ...input, candidates: [current, sameFamily], history: [] })).toBeNull();
    expect(selectSimilarQuestion({ ...input, candidates: [current, other], usedQuestionIds: [current.questionId, other.questionId], history: [] })).toBeNull();
    expect(
      selectSimilarQuestion({ ...input, candidates: [current, other], history: [{ questionId: other.questionId, lastAnsweredAt: daysAgo(1), lastScoreRatio: 1 }] }),
    ).toBeNull();
  });

  it("only looks at the skill it was asked about", () => {
    const { current } = base();
    const elsewhere = question({ outcomeId: "mass" });
    expect(
      selectSimilarQuestion({ candidates: [current, elsewhere], outcomeId: "len", avoidFamilyIds: ["fam-current"], usedQuestionIds: [current.questionId], state: "learning", history: [], now: NOW, seed: "s" }),
    ).toBeNull();
  });
});
