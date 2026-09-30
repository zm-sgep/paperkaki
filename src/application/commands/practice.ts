import { InputError, NotFoundError } from "@/application/errors";
import { recomputeMasteryProfiles } from "@/application/mastery";
import { awardForPractice, awardSafely } from "@/application/rewards";
import { getLearningMap, practiceCandidateOf, recommendedTopic, type LearningMap, type MapTopic } from "@/application/queries/learning-map";
import type { CurrentChild } from "@/application/queries/current-child";
import { shownUnitOf } from "@/domain/attempts";
import { markQuestion, type MarkableQuestion } from "@/domain/marking";
import { markingResponseFor } from "@/domain/attempts";
import { evidenceFromAnswers } from "@/domain/mastery";
import {
  activeGapSeconds,
  practiceHint,
  practisedMinutes,
  selectPracticeQuestions,
  selectSimilarQuestion,
  type FeedbackResult,
  type PracticeCandidate,
  type PracticeHint,
  type QuestionHistory,
} from "@/domain/recommendations";
import { answerText } from "@/domain/questions";
import { recordAuditEvent } from "@/lib/audit";
import type { Database } from "@/repositories/postgres/client";
import { getOwnedChild } from "@/repositories/postgres/assessments";
import { insertMasteryEvidence, listAnsweredQuestionIds } from "@/repositories/postgres/mastery";
import {
  completePracticeSession,
  countPracticeSessions,
  getOpenPracticeSession,
  getPendingSuggestion,
  getPracticeSessionOfChild,
  insertPracticeResponses,
  insertPracticeSession,
  listPracticeItems,
  listQuestionHistory,
  markSuggestionStarted,
  openPracticePositionAfter,
  replacePendingSuggestion,
  saveAnswer,
  touchPracticeSession,
  type PracticeItem,
} from "@/repositories/postgres/practice";
import type { PracticeSessionRow } from "@/repositories/postgres/schema";
import { AnswerSchema, MarkingSchemeSchema, QuestionContentSchema, WorkedSolutionSchema, type Block } from "@/schemas/question-content";
import { resolveCommandDb, type CommandContext } from "./children";

/**
 * Practice commands (M9). A set is chosen once, by rule, when it starts; answers are marked by rule the
 * moment they are checked and become mastery evidence in the same step. Everything takes the child's own
 * session, so a session that is not theirs is "not found".
 */

export type PracticeTarget = { kind: "topic"; topicId: string } | { kind: "outcome"; outcomeId: string };
export type PracticeOrigin = "recommended" | "suggested" | "chosen" | "similar";

export type StartPracticeOptions = {
  origin?: PracticeOrigin;
  /** Ask for exactly this many questions ("one like this" from a mistake). */
  count?: number;
  /** A question the new set should not repeat, nor any question of its family. */
  like?: string;
};

export type StartPracticeResult = { sessionId: string; resumed: boolean };

/** The most extra questions "Try one like this" can add to one set. */
export const MAX_EXTRA_QUESTIONS = 3;

const iso = (date: Date): string => date.toISOString();

function historyOf(rows: { questionId: string; lastAnsweredAt: Date; lastScoreRatio: number }[]): QuestionHistory[] {
  return rows.map((row) => ({ questionId: row.questionId, lastAnsweredAt: iso(row.lastAnsweredAt), lastScoreRatio: row.lastScoreRatio }));
}

function isUniqueViolation(error: unknown): boolean {
  for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
    if ((cause as Error & { code?: string }).code === "23505") return true;
  }
  return false;
}

/** The topic a target belongs to, and the skills to draw from. */
function resolveTarget(map: LearningMap, target: PracticeTarget): { topic: MapTopic; outcomeId: string | null } {
  if (target.kind === "topic") {
    const topic = map.topics.find((candidate) => candidate.topicId === target.topicId);
    if (!topic) throw new NotFoundError();
    return { topic, outcomeId: null };
  }
  const topic = map.topics.find((candidate) => candidate.testable.some((outcome) => outcome.outcomeId === target.outcomeId));
  if (!topic) throw new NotFoundError();
  return { topic, outcomeId: target.outcomeId };
}

/** Starts a set for a topic or a skill, or returns the set the child has not finished yet. */
export async function startPractice(
  child: CurrentChild,
  target: PracticeTarget,
  options: StartPracticeOptions = {},
  context: CommandContext = {},
): Promise<StartPracticeResult> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();

  const open = await getOpenPracticeSession(db, child.childId);
  if (open) return { sessionId: open.id, resumed: true };

  const map = await getLearningMap(child.childId, { db, now });
  if (!map) throw new InputError({ form: "Practice isn't ready yet. Please try again later." });
  const { topic, outcomeId } = resolveTarget(map, target);
  const outcome = outcomeId ? topic.testable.find((candidate) => candidate.outcomeId === outcomeId) : undefined;

  const topicCandidates = map.candidates.filter((candidate) => topic.testable.some((o) => o.outcomeId === candidate.primaryOutcomeId));
  const like = options.like ? topicCandidates.find((candidate) => candidate.questionId === options.like) : undefined;
  const avoidFamilies = new Set(like ? [like.familyId] : []);
  const usable = (candidates: PracticeCandidate[]) => candidates.filter((candidate) => !avoidFamilies.has(candidate.familyId));
  const history = historyOf(await listQuestionHistory(db, child.childId, topicCandidates.map((candidate) => candidate.questionId)));
  const sessionCount = await countPracticeSessions(db, child.childId);
  const seed = `${child.childId}:${outcomeId ?? topic.topicId}:${sessionCount}`;

  const focusFor = (outcomes: typeof topic.testable) =>
    outcomes.map((entry) => ({ outcomeId: entry.outcomeId, state: entry.mastery.state, ...(entry.mastery.reviewDueAt ? { reviewDueAt: entry.mastery.reviewDueAt } : {}) }));
  const pick = (outcomes: typeof topic.testable, count?: number) => {
    const ids = new Set(outcomes.map((entry) => entry.outcomeId));
    return selectPracticeQuestions({
      candidates: usable(topicCandidates.filter((candidate) => ids.has(candidate.primaryOutcomeId)).map(practiceCandidateOf)),
      focus: focusFor(outcomes),
      history,
      now: iso(now),
      seed,
      ...(like ? { excludeQuestionIds: [like.questionId] } : {}),
      ...(count !== undefined ? { count } : {}),
    });
  };
  let set = pick(outcome ? [outcome] : topic.testable, options.count);
  // A single skill with too few questions for a whole set borrows from the rest of its topic.
  if (outcome && options.count === undefined && set.questionIds.length < 6) set = pick(topic.testable);
  if (set.questionIds.length === 0) throw new InputError({ form: "We don't have questions for this yet." });

  const candidateOf = new Map(topicCandidates.map((candidate) => [candidate.questionId, candidate]));
  const suggestion = await getPendingSuggestion(db, child.childId);
  const fromSuggestion = suggestion !== null && suggestion.topicId === topic.topicId && options.origin !== "similar";
  const origin: PracticeOrigin = fromSuggestion ? "suggested" : (options.origin ?? "chosen");

  try {
    const sessionId = await db.transaction(async (tx) => {
      const session = await insertPracticeSession(tx, {
        childId: child.childId,
        focusKind: outcome ? "outcome" : "topic",
        topicId: topic.topicId,
        outcomeId: outcome?.outcomeId ?? null,
        focusLabel: outcome ? outcome.label : topic.label,
        origin,
        seed,
        startedAt: now,
        lastActiveAt: now,
      });
      await insertPracticeResponses(
        tx,
        set.questionIds.map((questionId, index) => {
          const candidate = candidateOf.get(questionId) as (typeof topicCandidates)[number];
          return { sessionId: session.id, position: index + 1, questionId, outcomeId: candidate.primaryOutcomeId, maxScore: candidate.marks };
        }),
      );
      if (fromSuggestion && suggestion) await markSuggestionStarted(tx, suggestion.id, session.id);
      await recordAuditEvent(tx, {
        action: "practice.started",
        entityType: "practice_session",
        entityId: session.id,
        actorProfileId: child.parentProfileId,
        metadata: { origin, questionCount: set.questionIds.length },
        requestId: context.requestId ?? null,
      });
      return session.id;
    });
    return { sessionId, resumed: false };
  } catch (error) {
    // Two taps at once: the set that won is the child's set.
    if (isUniqueViolation(error)) {
      const winner = await getOpenPracticeSession(db, child.childId);
      if (winner) return { sessionId: winner.id, resumed: true };
    }
    throw error;
  }
}

/** Starts what Today and Practice recommend (a parent's suggestion first), in one tap. */
export async function startRecommendedPractice(child: CurrentChild, context: CommandContext = {}): Promise<StartPracticeResult> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const open = await getOpenPracticeSession(db, child.childId);
  if (open) return { sessionId: open.id, resumed: true };
  const suggestion = await getPendingSuggestion(db, child.childId);
  if (suggestion) return startPractice(child, { kind: "topic", topicId: suggestion.topicId }, { origin: "suggested" }, context);
  const map = await getLearningMap(child.childId, { db, now });
  const topic = map ? recommendedTopic(map, now) : undefined;
  if (!topic) throw new InputError({ form: "There's nothing to practise right now. Nice work!" });
  return startPractice(child, { kind: "topic", topicId: topic.topicId }, { origin: "recommended" }, context);
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

export type PracticeFeedback = {
  result: FeedbackResult;
  /** After a wrong answer: the first step of the working, or a nudge. */
  hint: PracticeHint | null;
  /** The whole worked solution, shown when the child asks "Show how". Empty after a right answer. */
  solution: Block[];
  /** The answer, shown together with the solution. Empty after a right answer. */
  correctAnswer: string;
  /** No question is left in the set. */
  isLast: boolean;
  /** Whether "Try one like this" has a question to offer. */
  canTryLike: boolean;
};

export type PracticeAnswerInput = { selected: string | null; typed: string | null };

async function similarFor(db: Database, child: CurrentChild, session: PracticeSessionRow, item: PracticeItem, items: PracticeItem[], now: Date): Promise<string | null> {
  if (items.filter((entry) => entry.response.addedAs === "similar").length >= MAX_EXTRA_QUESTIONS) return null;
  const map = await getLearningMap(child.childId, { db, now });
  if (!map) return null;
  const topic = map.topics.find((candidate) => candidate.testable.some((outcome) => outcome.outcomeId === item.response.outcomeId));
  const outcome = topic?.testable.find((candidate) => candidate.outcomeId === item.response.outcomeId);
  if (!topic || !outcome) return null;
  const candidates = map.candidates.filter((candidate) => candidate.primaryOutcomeId === outcome.outcomeId).map(practiceCandidateOf);
  const history = historyOf(await listQuestionHistory(db, child.childId, candidates.map((candidate) => candidate.questionId)));
  return selectSimilarQuestion({
    candidates,
    outcomeId: outcome.outcomeId,
    avoidFamilyIds: items.map((entry) => entry.question.familyId),
    usedQuestionIds: items.map((entry) => entry.response.questionId),
    state: outcome.mastery.state,
    history,
    now: iso(now),
    seed: `${session.seed}:like:${item.response.position}:${items.length}`,
  });
}

async function feedbackOf(
  db: Database,
  child: CurrentChild,
  session: PracticeSessionRow,
  item: PracticeItem,
  items: PracticeItem[],
  now: Date,
): Promise<PracticeFeedback> {
  const result = (item.response.result ?? "unclear") as FeedbackResult;
  const content = QuestionContentSchema.parse(item.question.content);
  const answer = AnswerSchema.parse(item.question.answer);
  const solution = WorkedSolutionSchema.safeParse(item.question.workedSolution);
  const blocks = solution.success ? solution.data : [];
  const isLast = items.every((entry) => entry.response.id === item.response.id || entry.response.answeredAt !== null);
  const wrong = result !== "right";
  return {
    result,
    hint: wrong ? practiceHint(blocks) : null,
    solution: wrong ? blocks : [],
    correctAnswer: wrong ? answerText(answer, content) : "",
    isLast,
    canTryLike: wrong ? (await similarFor(db, child, session, item, items, now)) !== null : false,
  };
}

/** Checks one answer: marks it by rule, keeps it, and returns what the screen shows next. Checking twice changes nothing. */
export async function answerPracticeQuestion(
  child: CurrentChild,
  sessionId: string,
  position: number,
  input: PracticeAnswerInput,
  context: CommandContext = {},
): Promise<PracticeFeedback> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const session = await getPracticeSessionOfChild(db, child.childId, sessionId);
  if (!session) throw new NotFoundError();
  if (session.status !== "in_progress") throw new InputError({ form: "This practice is finished." });
  const items = await listPracticeItems(db, session.id);
  const item = items.find((entry) => entry.response.position === position);
  if (!item) throw new NotFoundError();
  if (item.response.answeredAt) return feedbackOf(db, child, session, item, items, now);

  const answer = AnswerSchema.parse(item.question.answer);
  const selected = input.selected && ["A", "B", "C", "D"].includes(input.selected) ? input.selected : null;
  const typed = input.typed?.trim() ? input.typed.trim().slice(0, 500) : null;
  if (answer.kind === "mcq" ? selected === null : typed === null) throw new InputError({ answer: "Choose or write an answer first." });
  const unit = shownUnitOf(answer) ?? null;
  const scheme = MarkingSchemeSchema.parse(item.question.markingScheme);
  const markable: MarkableQuestion = { id: item.response.id, questionType: item.question.questionType, marks: item.response.maxScore, answer, markingScheme: scheme };
  const decision = markQuestion(markable, markingResponseFor({ selectedOption: selected, typedAnswer: answer.kind === "mcq" ? null : typed, typedUnit: unit, hasStrokes: false }));
  // Something a person would need to look at cannot be judged here: it is not counted for or against the child.
  const unclear = decision.reviewRequired;
  const score = unclear ? 0 : decision.score;
  const result: FeedbackResult = unclear ? "unclear" : score >= item.response.maxScore ? "right" : "wrong";

  await db.transaction(async (tx) => {
    const saved = await saveAnswer(tx, item.response.id, {
      selectedOption: answer.kind === "mcq" ? selected : null,
      typedAnswer: answer.kind === "mcq" ? null : typed,
      typedUnit: answer.kind === "mcq" ? null : unit,
      score,
      result,
      answeredAt: now,
    });
    if (!saved) return; // Answered a moment ago (two taps): nothing more to write.
    await touchPracticeSession(tx, session.id, {
      lastActiveAt: now,
      activeSeconds: session.activeSeconds + activeGapSeconds(session.lastActiveAt, now),
    });
    if (unclear) return;
    const answered = await listAnsweredQuestionIds(tx, child.childId);
    const [entry] = evidenceFromAnswers(
      [
        {
          outcomeId: item.response.outcomeId,
          questionId: item.question.id,
          familyId: item.question.familyId,
          questionType: item.question.questionType,
          difficulty: item.question.difficulty,
          score,
          maxScore: item.response.maxScore,
          sessionId: session.id,
          answeredAt: iso(now),
        },
      ],
      answered,
    );
    if (!entry) return;
    await insertMasteryEvidence(tx, [
      {
        childId: child.childId,
        outcomeId: entry.outcomeId,
        questionId: entry.questionId,
        familyId: entry.familyId,
        questionType: entry.questionType,
        difficulty: entry.difficulty,
        scoreRatio: entry.scoreRatio,
        firstAttempt: entry.firstAttempt,
        sourceKind: "practice",
        practiceSessionId: session.id,
        practiceResponseId: item.response.id,
        occurredAt: now,
      },
    ]);
    await recomputeMasteryProfiles(tx, child.childId, [entry.outcomeId], now);
  });

  const fresh = await listPracticeItems(db, session.id);
  const answeredItem = fresh.find((entry) => entry.response.position === position) as PracticeItem;
  return feedbackOf(db, child, session, answeredItem, fresh, now);
}

/** "Try one like this": adds one question on the same skill, from a different family, right after this one. */
export async function addSimilarQuestion(
  child: CurrentChild,
  sessionId: string,
  position: number,
  context: CommandContext = {},
): Promise<{ position: number }> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const session = await getPracticeSessionOfChild(db, child.childId, sessionId);
  if (!session) throw new NotFoundError();
  if (session.status !== "in_progress") throw new InputError({ form: "This practice is finished." });
  const items = await listPracticeItems(db, session.id);
  const item = items.find((entry) => entry.response.position === position);
  if (!item) throw new NotFoundError();
  if (!item.response.answeredAt || item.response.result === "right") throw new InputError({ form: "Try one like this after a question that was not quite right." });

  // Already added for this question (a second tap): the next question is it.
  const next = items.find((entry) => entry.response.position === position + 1);
  if (next && next.response.addedAs === "similar" && !next.response.answeredAt) return { position: next.response.position };

  const questionId = await similarFor(db, child, session, item, items, now);
  if (!questionId) throw new InputError({ form: "We don't have another one like this yet." });
  const map = await getLearningMap(child.childId, { db, now });
  const candidate = map?.candidates.find((entry) => entry.questionId === questionId);
  if (!candidate) throw new NotFoundError();
  return db.transaction(async (tx) => {
    const at = await openPracticePositionAfter(tx, session.id, position);
    await insertPracticeResponses(tx, [
      { sessionId: session.id, position: at, questionId, outcomeId: item.response.outcomeId, addedAs: "similar", maxScore: candidate.marks },
    ]);
    return { position: at };
  });
}

export type FinishedPractice = { sessionId: string; minutes: number };

/** Finishes the set once every question has been checked. Finishing twice gives the same answer. */
export async function finishPractice(child: CurrentChild, sessionId: string, context: CommandContext = {}): Promise<FinishedPractice> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const session = await getPracticeSessionOfChild(db, child.childId, sessionId);
  if (!session) throw new NotFoundError();
  if (session.status === "completed") return { sessionId, minutes: session.minutes ?? 1 };
  const items = await listPracticeItems(db, session.id);
  if (items.some((entry) => entry.response.answeredAt === null)) throw new InputError({ form: "There are still questions to answer." });
  const minutes = practisedMinutes(session.activeSeconds);
  await completePracticeSession(db, session.id, { completedAt: now, minutes });
  await recordAuditEvent(db, {
    action: "practice.completed",
    entityType: "practice_session",
    entityId: session.id,
    actorProfileId: child.parentProfileId,
    metadata: { minutes, questionCount: items.length },
    requestId: context.requestId ?? null,
  });
  // Learning Points follow the learning and never change it: if awarding fails the set still stands, and the
  // end screen tries again (awarding is once per set).
  await awardSafely(() => awardForPractice(db, child.childId, sessionId, now), "practice");
  return { sessionId, minutes };
}

// ---------------------------------------------------------------------------
// The parent's suggestion
// ---------------------------------------------------------------------------

/**
 * "Suggest to Darius": pins a topic as the child's next practice mission until they start it. Only the
 * parent's own child; suggesting the same topic again changes nothing, and a different one replaces it.
 */
export async function suggestPractice(
  parentProfileId: string,
  childId: string,
  topicId: string,
  context: CommandContext = {},
): Promise<{ topicLabel: string; created: boolean }> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const child = await getOwnedChild(db, parentProfileId, childId);
  if (!child || child.archivedAt) throw new NotFoundError();
  const map = await getLearningMap(child.id, { db, now });
  const topic = map?.topics.find((candidate) => candidate.topicId === topicId);
  if (!topic) throw new NotFoundError();
  return db.transaction(async (tx) => {
    const { created } = await replacePendingSuggestion(tx, { childId: child.id, topicId, suggestedBy: parentProfileId });
    if (created) {
      await recordAuditEvent(tx, {
        action: "practice.suggested",
        entityType: "child",
        entityId: child.id,
        actorProfileId: parentProfileId,
        metadata: { topicId },
        requestId: context.requestId ?? null,
      });
    }
    return { topicLabel: topic.label, created };
  });
}
