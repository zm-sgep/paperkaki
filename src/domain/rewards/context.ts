/**
 * Building a RewardContext from what the app knows (spec sections 5-8, ARCHITECTURE 17.2).
 *
 * The RewardEngine only reads a context; this module is how the context is made. It is pure: the caller
 * hands over the child's mastery evidence and a few flags it looked up (was mastery already paid, are there
 * mistakes waiting), and every counter the anti-farming rules need is derived here from the evidence itself,
 * so the same inputs always give the same context and nothing depends on a clock or a database.
 *
 * Mastery states come from the mastery domain (`deriveOutcomeMastery` and `topicMasteryOf`), never from a
 * second copy of its rules: "before" is the state from all the evidence that came before the activity began,
 * "after" is the state once the activity's own evidence is in.
 */
import {
  deriveOutcomeMastery,
  topicMasteryOf,
  type MasteryEvidence,
  type TopicMastery,
} from "@/domain/mastery";
import {
  DIFFICULTIES,
  type ActivityType,
  type Difficulty,
  type NextActionCandidates,
  type RewardContext,
} from "./entities";

/** How far back "the same question family was already used" looks. */
export const RECENT_FAMILY_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;
const SINGAPORE_OFFSET_MS = 8 * 3_600_000;
const POOL = "reward-scope";

/** The skills an activity is about. Evidence on them is pooled the way a topic's evidence is. */
export type ActivityScope = {
  /** Every skill of the scope that the question bank can test. A scope is not called secure until each was seen. */
  testableOutcomeIds: readonly string[];
};

export type RewardContextInput = {
  childId: string;
  /** For example `practice:{sessionId}`. One event, at most one award. */
  sourceEventId: string;
  activityType: ActivityType;
  /**
   * The id the activity's own evidence carries as `sessionId` (a practice set or a mock attempt). Leave it
   * out for an activity that adds no evidence, such as a mistake review.
   */
  activityId?: string | undefined;
  scope: ActivityScope;
  /** The topic in the child's words, for nudges. */
  topicLabel?: string | undefined;
  /** All of the child's evidence on the scope's skills (later evidence is ignored for "before" and "after"). */
  evidence: readonly MasteryEvidence[];
  /** ISO time used when the activity has no evidence of its own. */
  now: string;
  reviewedMistakes: boolean;
  firstMasteryAlreadyAwarded: boolean;
  underPractisedRelevant?: boolean | undefined;
  /** True once marked results exist; a mock is rewarded only then. */
  resultsAvailable?: boolean | undefined;
  nextActionCandidates?: NextActionCandidates | undefined;
};

export type RewardContextResult = {
  context: RewardContext;
  /** The scope's state before and after, for the ledger and for tests. */
  before: TopicMastery;
  after: TopicMastery;
};

const ms = (value: string): number => Date.parse(value);

/** The scope's mastery as of `at`: evidence dated later is left out, and evidence in `exclude` sessions too. */
export function masteryOfScope(
  evidence: readonly MasteryEvidence[],
  scope: ActivityScope,
  at: string,
  exclude?: (entry: MasteryEvidence) => boolean,
): TopicMastery {
  const testable = new Set(scope.testableOutcomeIds);
  const atMs = ms(at);
  const inScope = evidence.filter((entry) => testable.has(entry.outcomeId) && ms(entry.at) <= atMs && !(exclude?.(entry) ?? false));
  const pooled = deriveOutcomeMastery(
    POOL,
    inScope.map((entry) => ({ ...entry, outcomeId: POOL })),
    at,
  );
  const covered = new Set(inScope.map((entry) => entry.outcomeId)).size;
  return topicMasteryOf({ pooled, testableCount: Math.max(1, testable.size), coveredCount: covered });
}

/** The most common difficulty among some evidence. A tie goes to the harder one. */
export function modalDifficulty(items: readonly Pick<MasteryEvidence, "difficulty">[]): Difficulty {
  const counts = new Map<Difficulty, number>();
  for (const item of items) counts.set(item.difficulty, (counts.get(item.difficulty) ?? 0) + 1);
  let best: Difficulty = "standard";
  let bestCount = 0;
  for (const difficulty of DIFFICULTIES) {
    const count = counts.get(difficulty) ?? 0;
    if (count >= bestCount && count > 0) {
      best = difficulty;
      bestCount = count;
    }
  }
  return best;
}

/** The Singapore calendar day of a moment, "YYYY-MM-DD". */
function singaporeDay(atMs: number): string {
  return new Date(atMs + SINGAPORE_OFFSET_MS).toISOString().slice(0, 10);
}

function groupBySession(items: readonly MasteryEvidence[]): Map<string, MasteryEvidence[]> {
  const groups = new Map<string, MasteryEvidence[]>();
  for (const item of items) groups.set(item.sessionId, [...(groups.get(item.sessionId) ?? []), item]);
  return groups;
}

export function buildRewardContext(input: RewardContextInput): RewardContextResult {
  const testable = new Set(input.scope.testableOutcomeIds);
  const scoped = input.evidence.filter((entry) => testable.has(entry.outcomeId));
  const own = input.activityId ? input.evidence.filter((entry) => entry.sessionId === input.activityId) : [];
  const hasOwn = own.length > 0;
  const isOwn = (entry: MasteryEvidence): boolean => entry.sessionId === input.activityId;

  const times = own.map((entry) => ms(entry.at));
  const startMs = hasOwn ? Math.min(...times) : ms(input.now);
  const endMs = hasOwn ? Math.max(...times) : ms(input.now);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  // Before: everything that came earlier than this activity. After: that plus the activity itself.
  const before = masteryOfScope(
    scoped,
    input.scope,
    startIso,
    (entry) => isOwn(entry) || (hasOwn && ms(entry.at) >= startMs),
  );
  const after = masteryOfScope(scoped, input.scope, endIso);

  const prior = scoped.filter((entry) => !isOwn(entry) && ms(entry.at) < startMs);
  const accuracy = hasOwn ? own.reduce((sum, entry) => sum + entry.scoreRatio, 0) / own.length : undefined;
  const previousAccuracy = before.evidenceCount > 0 ? before.recentAccuracy : undefined;

  // The same question family used in earlier sessions inside the window; a whole set of repeats is needed to count.
  let repeatedFamilyCountRecent = 0;
  if (hasOwn) {
    const windowStart = startMs - RECENT_FAMILY_WINDOW_DAYS * DAY_MS;
    const families = [...new Set(own.map((entry) => entry.familyId))];
    const counts = families.map(
      (familyId) =>
        new Set(prior.filter((entry) => entry.familyId === familyId && ms(entry.at) >= windowStart).map((entry) => entry.sessionId)).size,
    );
    repeatedFamilyCountRecent = counts.length === 0 ? 0 : Math.floor(counts.reduce((sum, value) => sum + value, 0) / counts.length);
  }

  // Sessions on this scope earlier the same Singapore day.
  const day = singaporeDay(startMs);
  const priorSessions = groupBySession(prior);
  const topicRewardedSessionsRecent = hasOwn
    ? [...priorSessions.values()].filter((items) => items.some((entry) => singaporeDay(ms(entry.at)) === day)).length
    : 0;

  // A near-identical earlier activity: the same skills at the same difficulty, and how long ago it ended.
  let minutesSinceNearIdenticalActivity: number | undefined;
  if (hasOwn) {
    const ownSkills = [...new Set(own.map((entry) => entry.outcomeId))].sort().join(",");
    const ownDifficulty = modalDifficulty(own);
    let latestEnd: number | undefined;
    for (const items of priorSessions.values()) {
      const skills = [...new Set(items.map((entry) => entry.outcomeId))].sort().join(",");
      if (skills !== ownSkills || modalDifficulty(items) !== ownDifficulty) continue;
      const end = Math.max(...items.map((entry) => ms(entry.at)));
      if (latestEnd === undefined || end > latestEnd) latestEnd = end;
    }
    if (latestEnd !== undefined) minutesSinceNearIdenticalActivity = Math.max(0, (startMs - latestEnd) / 60_000);
  }

  const spacedReviewDue = before.reviewDueAt !== undefined && ms(before.reviewDueAt) <= startMs;
  const outcomeIds = hasOwn ? [...new Set(own.map((entry) => entry.outcomeId))] : [...testable];

  const context: RewardContext = {
    childId: input.childId,
    sourceEventId: input.sourceEventId,
    activityType: input.activityType,
    outcomeIds,
    ...(input.topicLabel !== undefined ? { topicLabel: input.topicLabel } : {}),
    firstMeaningfulAttempt: hasOwn ? own.some((entry) => entry.firstAttempt) : true,
    ...(input.resultsAvailable !== undefined ? { resultsAvailable: input.resultsAvailable } : {}),
    ...(accuracy !== undefined ? { accuracy } : {}),
    ...(previousAccuracy !== undefined ? { previousAccuracy } : {}),
    masteryBefore: before.attention,
    masteryAfter: after.attention,
    difficulty: hasOwn ? modalDifficulty(own) : "standard",
    repeatedFamilyCountRecent,
    topicRewardedSessionsRecent,
    spacedReviewDue,
    reviewedMistakes: input.reviewedMistakes,
    firstMasteryAlreadyAwarded: input.firstMasteryAlreadyAwarded,
    ...(input.underPractisedRelevant !== undefined ? { underPractisedRelevant: input.underPractisedRelevant } : {}),
    ...(minutesSinceNearIdenticalActivity !== undefined ? { minutesSinceNearIdenticalActivity } : {}),
    ...(input.nextActionCandidates !== undefined ? { nextActionCandidates: input.nextActionCandidates } : {}),
  };
  return { context, before, after };
}
