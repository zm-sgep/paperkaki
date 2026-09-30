import { randomUUID } from "node:crypto";
import { evidenceRowToDomain } from "@/application/mastery";
import { getLearningMap, recommendedTopic, startedTopics, type LearningMap, type MapTopic } from "@/application/queries/learning-map";
import { todayInSingapore } from "@/domain/assessments/dates";
import {
  buildRewardContext,
  calculateReward,
  earnedLine,
  entryFromDecision,
  validateLedgerEntry,
  validateRewardPolicy,
  type ActivityType,
  type NextActionCandidates,
  type RecommendedLearningAction,
  type RewardContext,
  type RewardDecision,
  type RewardPolicy,
  type RewardReason,
  type SummaryDetails,
} from "@/domain/rewards";
import { logger } from "@/lib/logger";
import type { Database } from "@/repositories/postgres/client";
import { listMarkedAttemptHeaders } from "@/repositories/postgres/attempts";
import { markingSummaries } from "@/repositories/postgres/marking";
import { listEvidenceForChild } from "@/repositories/postgres/mastery";
import { getPracticeSessionOfChild, listPracticeItems } from "@/repositories/postgres/practice";
import {
  getActivePolicyRow,
  getDecision,
  hasFirstMasteryBonus,
  insertDecision,
  insertLedgerEntry,
  listUpcomingScopeOutcomeIds,
  lockChildPoints,
} from "@/repositories/postgres/rewards";
import type { RewardDecisionRow } from "@/repositories/postgres/schema";
import { attemptSessions } from "@/repositories/postgres/schema";
import { RewardPolicySchema } from "@/schemas/rewards";
import { eq } from "drizzle-orm";

/**
 * Awarding Learning Points (Milestone 11). After learning happens, the RewardEngine decides; this module
 * gathers what the engine needs (mastery before and after, recent activity), writes the decision and the one
 * ledger entry it earned, and makes that safe to repeat: every activity has one source event id, so a retry,
 * a double tap or a job that runs twice awards once.
 *
 * Awarding never changes an academic result. Callers use `awardSafely`: if anything here fails the practice,
 * mistake review or mock result stands and the error is logged, and the next look at the screen tries again.
 *
 * Source event ids: `practice:{sessionId}`, `mistake-review:{attemptId}`, `mock-result:{attemptId}`.
 */

export const practiceEventId = (sessionId: string): string => `practice:${sessionId}`;
export const mistakeReviewEventId = (attemptId: string): string => `mistake-review:${attemptId}`;
export const mockResultEventId = (attemptId: string): string => `mock-result:${attemptId}`;

/** What a family is shown after an activity. */
export type ActivityReward = {
  points: number;
  reasonCodes: RewardReason[];
  /** "+14 Learning Points · You improved in Fractions and reviewed two mistakes." Null when nothing was earned. */
  line: string | null;
  /** The engine's encouraging redirect, when yield was low. */
  redirect: string | null;
};

type Redirect = { message: string; action: RecommendedLearningAction["action"] };

export function activityRewardOf(row: RewardDecisionRow): ActivityReward {
  const reasonCodes = row.reasonCodes as RewardReason[];
  const details = row.details as SummaryDetails;
  const redirect = row.redirect as Redirect | null;
  return {
    points: row.points,
    reasonCodes,
    line: row.points > 0 ? earnedLine(row.points, reasonCodes, details) : null,
    redirect: redirect?.message ?? null,
  };
}

/** The policy in force now, checked before use. A broken policy stops awarding rather than paying wrongly. */
export async function resolveRewardPolicy(db: Database, now: Date): Promise<RewardPolicy> {
  const row = await getActivePolicyRow(db, now);
  if (!row) throw new Error("No active reward policy.");
  const parsed = RewardPolicySchema.safeParse(row.policy);
  if (!parsed.success) throw new Error(`Reward policy ${row.version} is not readable.`);
  const policy = parsed.data as RewardPolicy;
  const problems = validateRewardPolicy(policy);
  if (problems.length > 0) throw new Error(`Reward policy ${row.version} is not valid: ${problems.join("; ")}`);
  if (policy.version !== row.version) throw new Error(`Reward policy ${row.version} names a different version.`);
  return policy;
}

type Source = { sourceType: "practice_session" | "mistake_review" | "mock_attempt"; sourceId: string; sourceEventId: string };

type Built = {
  context: RewardContext;
  /** Identifies what the one-time mastery bonus was paid for. */
  scopeKey: string;
  details: SummaryDetails;
  /** The activity left no evidence, so there is nothing to reward (a zero decision is still recorded). */
  noEvidence?: boolean;
};

/** The topics an activity touched, the skills to judge them on, and how to name them. */
function scopeOf(map: LearningMap, outcomeIds: readonly string[]): { topics: MapTopic[]; testableOutcomeIds: string[]; scopeKey: string } {
  const wanted = new Set(outcomeIds);
  const topics = map.topics.filter((topic) => topic.testable.some((outcome) => wanted.has(outcome.outcomeId)));
  return {
    topics,
    testableOutcomeIds: [...new Set(topics.flatMap((topic) => topic.testable.map((outcome) => outcome.outcomeId)))],
    scopeKey: topics.length === 1 ? `topic:${topics[0]?.topicId}` : `topics:${topics.map((topic) => topic.topicId).sort().join(",")}`,
  };
}

async function unreviewedMistakes(db: Database, childId: string): Promise<boolean> {
  const marked = await listMarkedAttemptHeaders(db, childId);
  const summaries = await markingSummaries(db, marked.map((header) => header.attempt.id));
  return marked.some((header) => header.attempt.mistakesReviewedAt === null && (summaries.get(header.attempt.id)?.mistakes ?? 0) > 0);
}

/** Where the child could usefully go next, in the spec's order of priority (section 8). */
function nextCandidates(map: LearningMap, current: readonly MapTopic[], now: Date, mistakesWaiting: boolean, upcomingOutcomes: ReadonlySet<string>): NextActionCandidates {
  const here = new Set(current.map((topic) => topic.topicId));
  const target = (topic: MapTopic) => ({ outcomeId: topic.topicId, label: topic.label });
  const candidates: NextActionCandidates = {};
  const weak = recommendedTopic(map, now);
  if (weak && !here.has(weak.topicId)) candidates.weakOutcome = target(weak);
  const underPractised = map.topics.find(
    (topic) => !here.has(topic.topicId) && topic.mastery.state === "not_started" && topic.testable.some((outcome) => upcomingOutcomes.has(outcome.outcomeId)),
  );
  if (underPractised) candidates.underPractisedOutcome = target(underPractised);
  if (mistakesWaiting) candidates.mistakeReviewDue = true;
  const due = startedTopics(map).find(
    (topic) => !here.has(topic.topicId) && topic.mastery.reviewDueAt !== undefined && Date.parse(topic.mastery.reviewDueAt) <= now.getTime(),
  );
  if (due) candidates.retentionReview = target(due);
  const strong = current.find((topic) => topic.mastery.state === "mastered" || topic.mastery.state === "retained");
  if (strong) candidates.transferOutcome = target(strong);
  return candidates;
}

async function commonLookups(db: Database, childId: string, map: LearningMap, current: readonly MapTopic[], now: Date) {
  const [mistakesWaiting, upcoming] = await Promise.all([
    unreviewedMistakes(db, childId),
    listUpcomingScopeOutcomeIds(db, childId, todayInSingapore(now)),
  ]);
  const upcomingOutcomes = new Set(upcoming);
  return { mistakesWaiting, upcomingOutcomes, candidates: nextCandidates(map, current, now, mistakesWaiting, upcomingOutcomes) };
}

const SHORT_SET_MAX_QUESTIONS = 3;
/** A skill with fewer first answers than this is still "under-practised" when it matters for an assessment. */
const UNDER_PRACTISED_BELOW = 6;

async function buildPractice(db: Database, childId: string, sessionId: string, now: Date): Promise<Built | null> {
  const session = await getPracticeSessionOfChild(db, childId, sessionId);
  if (!session || session.status !== "completed") return null;
  const items = await listPracticeItems(db, session.id);
  const map = await getLearningMap(childId, { db, now });
  if (!map) return null;

  // A topic set is judged on its topic; a single skill on that skill (plus any it borrowed from its topic to fill the set).
  const answeredOutcomes = [...new Set(items.map((item) => item.response.outcomeId))];
  const focusOutcome = session.focusKind === "outcome" ? session.outcomeId : null;
  const touched = scopeOf(map, answeredOutcomes);
  const scopeIds = focusOutcome ? [...new Set([focusOutcome, ...answeredOutcomes])] : touched.testableOutcomeIds;
  const scopeKey = focusOutcome ? `outcome:${focusOutcome}` : touched.scopeKey;

  const evidence = (await listEvidenceForChild(db, childId, scopeIds)).map(evidenceRowToDomain);
  const { mistakesWaiting, upcomingOutcomes, candidates } = await commonLookups(db, childId, map, touched.topics, now);
  const earlierAnswers = evidence.filter((entry) => entry.sessionId !== session.id && entry.firstAttempt).length;
  const built = buildRewardContext({
    childId,
    sourceEventId: practiceEventId(session.id),
    activityType: items.length <= SHORT_SET_MAX_QUESTIONS ? "short_practice" : "targeted_practice",
    activityId: session.id,
    scope: { testableOutcomeIds: scopeIds },
    topicLabel: session.focusLabel,
    evidence,
    now: now.toISOString(),
    // A recovery reward waits for the mistakes from a marked mock to be gone through.
    reviewedMistakes: !mistakesWaiting,
    firstMasteryAlreadyAwarded: await hasFirstMasteryBonus(db, childId, scopeKey),
    underPractisedRelevant: scopeIds.some((id) => upcomingOutcomes.has(id)) && earlierAnswers < UNDER_PRACTISED_BELOW,
    nextActionCandidates: candidates,
  });
  // Mastered work that is due again is a retention check, and is paid as one.
  const isRetention = (built.context.masteryBefore === "mastered" || built.context.masteryBefore === "retained") && built.context.spacedReviewDue;
  const activityType: ActivityType = isRetention ? "retention_check" : built.context.activityType;
  return {
    context: { ...built.context, activityType },
    scopeKey,
    details: { topicLabel: session.focusLabel },
    // Only answers a person did not need to look at leave evidence: a set with none earns nothing.
    noEvidence: !evidence.some((entry) => entry.sessionId === session.id),
  };
}

async function buildMistakeReview(db: Database, childId: string, attemptId: string, now: Date): Promise<Built | null> {
  const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId)).limit(1);
  if (!attempt || attempt.childId !== childId || attempt.status !== "marked" || attempt.mistakesReviewedAt === null) return null;
  const map = await getLearningMap(childId, { db, now });
  if (!map) return null;
  const rows = (await listEvidenceForChild(db, childId)).filter((row) => row.attemptId === attemptId);
  const mistakeOutcomes = [...new Set(rows.filter((row) => row.scoreRatio < 1).map((row) => row.outcomeId))];
  const { topics, testableOutcomeIds, scopeKey } = scopeOf(map, mistakeOutcomes);
  const evidence = (await listEvidenceForChild(db, childId, testableOutcomeIds)).map(evidenceRowToDomain);
  const { candidates } = await commonLookups(db, childId, map, topics, now);
  const summary = (await markingSummaries(db, [attemptId])).get(attemptId);
  const built = buildRewardContext({
    childId,
    sourceEventId: mistakeReviewEventId(attemptId),
    activityType: "mistake_review",
    scope: { testableOutcomeIds },
    ...(topics.length === 1 ? { topicLabel: topics[0]?.label } : {}),
    evidence,
    now: now.toISOString(),
    reviewedMistakes: true,
    firstMasteryAlreadyAwarded: true,
    nextActionCandidates: candidates,
  });
  return {
    context: built.context,
    scopeKey,
    details: { ...(topics.length === 1 ? { topicLabel: topics[0]?.label } : {}), mistakeCount: summary?.mistakes ?? mistakeOutcomes.length },
  };
}

async function buildMockResult(db: Database, childId: string, attemptId: string, now: Date): Promise<Built | null> {
  const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId)).limit(1);
  if (!attempt || attempt.childId !== childId || attempt.status !== "marked") return null;
  const map = await getLearningMap(childId, { db, now });
  if (!map) return null;
  const rows = (await listEvidenceForChild(db, childId)).filter((row) => row.attemptId === attemptId);
  const { topics, testableOutcomeIds, scopeKey } = scopeOf(map, rows.map((row) => row.outcomeId));
  const evidence = (await listEvidenceForChild(db, childId, testableOutcomeIds)).map(evidenceRowToDomain);
  const { mistakesWaiting, upcomingOutcomes, candidates } = await commonLookups(db, childId, map, topics, now);
  const firstAnswers = evidence.filter((entry) => entry.sessionId !== attemptId && entry.firstAttempt).length;
  const built = buildRewardContext({
    childId,
    sourceEventId: mockResultEventId(attemptId),
    activityType: "mock",
    activityId: attemptId,
    scope: { testableOutcomeIds },
    evidence,
    now: now.toISOString(),
    // The mistakes from this very mock have not been gone through yet: that is a separate reward, later.
    reviewedMistakes: false,
    firstMasteryAlreadyAwarded: await hasFirstMasteryBonus(db, childId, scopeKey),
    underPractisedRelevant: testableOutcomeIds.some((id) => upcomingOutcomes.has(id)) && firstAnswers < UNDER_PRACTISED_BELOW && !mistakesWaiting,
    resultsAvailable: true,
    nextActionCandidates: candidates,
  });
  return { context: built.context, scopeKey, details: { subject: "your mock" } };
}

/**
 * Pays for one finished activity, once. Returns what was decided (the earlier decision when this event was
 * already handled). `build` gathers the context and may return null when the activity is not ready to be
 * rewarded (not finished, not marked yet, or not this child's).
 */
async function award(db: Database, childId: string, source: Source, now: Date, build: () => Promise<Built | null>): Promise<ActivityReward | null> {
  const existing = await getDecision(db, childId, source.sourceEventId);
  if (existing) return activityRewardOf(existing);

  const built = await build();
  if (!built) return null;
  const policy = await resolveRewardPolicy(db, now);
  const decision: RewardDecision = built.noEvidence
    ? { points: 0, reasonCodes: [], breakdown: [], policyVersion: policy.version, multipliers: {}, antiFarmingDecisions: [], capped: false }
    : calculateReward(built.context, policy);
  const redirect: Redirect | null = decision.recommendedNextAction
    ? { message: decision.recommendedNextAction.message, action: decision.recommendedNextAction.action }
    : null;

  const stored = await db.transaction(async (tx) => {
    await lockChildPoints(tx, childId);
    const raced = await getDecision(tx, childId, source.sourceEventId);
    if (raced) return raced;

    const entry = entryFromDecision(built.context, decision, { id: randomUUID(), createdAt: now.toISOString() });
    let ledgerEntryId: string | null = null;
    if (entry) {
      validateLedgerEntry(entry);
      const row = await insertLedgerEntry(tx, {
        id: entry.id,
        childId,
        amount: entry.amount,
        origin: entry.origin,
        reasonCode: entry.reasonCode,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        sourceEventId: entry.sourceEventId,
        policyVersion: entry.policyVersion ?? null,
        masteryBefore: entry.masteryBefore ?? null,
        masteryAfter: entry.masteryAfter ?? null,
        calculation: { ...(entry.calculation ?? {}), scopeKey: built.scopeKey, details: built.details },
        createdAt: now,
      });
      ledgerEntryId = row?.id ?? null;
    }
    const decisionRow = await insertDecision(tx, {
      childId,
      sourceEventId: source.sourceEventId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      activityType: built.context.activityType,
      points: ledgerEntryId ? decision.points : 0,
      reasonCodes: ledgerEntryId ? decision.reasonCodes : [],
      breakdown: ledgerEntryId ? decision.breakdown : [],
      redirect,
      details: built.details,
      policyVersion: decision.policyVersion,
      ledgerEntryId,
      createdAt: now,
    });
    const final = decisionRow ?? (await getDecision(tx, childId, source.sourceEventId));
    if (!final) throw new Error("The reward decision was not stored.");
    return final;
  });
  return activityRewardOf(stored);
}

/** Pays for a finished practice set. Safe to call again. */
export function awardForPractice(db: Database, childId: string, sessionId: string, now: Date): Promise<ActivityReward | null> {
  return award(db, childId, { sourceType: "practice_session", sourceId: sessionId, sourceEventId: practiceEventId(sessionId) }, now, () => buildPractice(db, childId, sessionId, now));
}

/** Pays for going through the mistakes of a marked mock. Safe to call again. */
export function awardForMistakeReview(db: Database, childId: string, attemptId: string, now: Date): Promise<ActivityReward | null> {
  return award(db, childId, { sourceType: "mistake_review", sourceId: attemptId, sourceEventId: mistakeReviewEventId(attemptId) }, now, () => buildMistakeReview(db, childId, attemptId, now));
}

/** Pays for a mock once its results are ready. Never during the attempt. Safe to call again. */
export function awardForMockResult(db: Database, childId: string, attemptId: string, now: Date): Promise<ActivityReward | null> {
  return award(db, childId, { sourceType: "mock_attempt", sourceId: attemptId, sourceEventId: mockResultEventId(attemptId) }, now, () => buildMockResult(db, childId, attemptId, now));
}

/** Runs an awarding step so that a failure can never undo or hide the learning it follows. */
export async function awardSafely(step: () => Promise<ActivityReward | null>, what: string): Promise<ActivityReward | null> {
  try {
    return await step();
  } catch (error) {
    logger.error({ err: error instanceof Error ? { name: error.name, message: error.message } : String(error), what }, "Learning Points could not be awarded; will retry");
    return null;
  }
}

/** The stored decision for an activity, if there is one. */
export async function getActivityReward(db: Database, childId: string, sourceEventId: string): Promise<ActivityReward | null> {
  const row = await getDecision(db, childId, sourceEventId);
  return row ? activityRewardOf(row) : null;
}
