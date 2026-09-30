import { getParentHomeState } from "@/application/queries/parent-home";
import { markingStepsFor, type MarkingStep } from "@/domain/attempts";
import { referencedAssetKeys, answerText } from "@/domain/questions";
import {
  changeFromPrevious,
  childAnswerText,
  childHeadline,
  explanationFor,
  isMistake,
  markText,
  markingSchemeWords,
  orderForReview,
  overTimeText,
  scoreText,
  thingsToLearn,
  topicBreakdown,
  topicsNeedingAttention,
  whatHappenedText,
  type Audience,
  type ResultChange,
  type ResultQuestion,
  type TopicRow,
} from "@/domain/marking";
import { attemptLabel } from "@/domain/attempts";
import { practiceOutcomesFromTopics, resultNextAction, type ParentAction, type ParentActionState } from "@/domain/recommendations";
import type { Database } from "@/repositories/postgres/client";
import { getAttemptHeader, listAttemptHeadersForParent, listMarkedAttemptHeaders, type AttemptHeader, type AttemptScope } from "@/repositories/postgres/attempts";
import { listAssessmentsForParent } from "@/repositories/postgres/assessments";
import {
  attemptTotals,
  finalScoreOf,
  isWaitingForCheck,
  listAttemptMarking,
  listMarkedAttemptsOfAssessment,
  listQuestionTopics,
  type MarkedQuestion,
} from "@/repositories/postgres/marking";
import { listPapersForAssessments } from "@/repositories/postgres/papers";
import { getReadyDb } from "@/repositories/postgres/ready";
import { AnswerSchema, QuestionContentSchema, MarkingSchemeSchema, WorkedSolutionSchema, type Block, type QuestionContent } from "@/schemas/question-content";
import { todayInSingapore } from "@/domain/assessments/dates";

/**
 * Results (M7, UX-08 and UX-07). One query module for the four result surfaces: the parent's results
 * and the child's results, the marked paper both can open, and the parent's quick check. Ownership is
 * the first thing every function checks: an attempt that is not the viewer's is null (a 404).
 *
 * Nothing here decides a mark. It reads the marks that count and puts them in the order and the words
 * the screens show. No screen shows a confidence, a model or a prediction of an exam mark.
 */

type Context = { db?: Database; now?: Date };

async function resolveDb(context: Context): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export type Viewer = { kind: "parent"; parentProfileId: string } | { kind: "child"; childId: string };

export const scopeOfViewer = (viewer: Viewer): AttemptScope =>
  viewer.kind === "parent" ? { parentProfileId: viewer.parentProfileId } : { childId: viewer.childId };

type Basics = {
  attemptId: string;
  /** "Mathematics WA2 · Mock 1" */
  label: string;
  mockNumber: number;
  childNickname: string;
  assessmentId: string;
  paperId: string;
  mode: "ipad" | "print_upload";
};

function basicsOf(header: AttemptHeader): Basics {
  return {
    attemptId: header.attempt.id,
    label: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
    mockNumber: header.paperNumber,
    childNickname: header.childNickname,
    assessmentId: header.assessmentId,
    paperId: header.paperId,
    mode: header.attempt.mode,
  };
}

// ---------------------------------------------------------------------------
// Where marking is
// ---------------------------------------------------------------------------

export type MarkingStatus =
  | (Basics & { state: "marking"; steps: MarkingStep[] })
  | (Basics & { state: "failed"; steps: MarkingStep[] })
  | (Basics & { state: "needs_check"; waitingCount: number })
  | (Basics & { state: "ready" });

/** Where a handed-in paper is: still being marked, waiting for the parent's check, or ready. */
export async function getMarkingStatus(scope: AttemptScope, attemptId: string, context: Context = {}): Promise<MarkingStatus | null> {
  const db = await resolveDb(context);
  const header = await getAttemptHeader(db, attemptId, scope);
  if (!header) return null;
  const { attempt } = header;
  const basics = basicsOf(header);
  // Not handed in yet: there is nothing to say about marking.
  if (attempt.status === "assigned" || attempt.status === "in_progress") return null;
  if (attempt.status === "marked") return { ...basics, state: "ready" };
  if (attempt.markingStage === "failed") return { ...basics, state: "failed", steps: markingStepsFor(attempt.mode, "failed") };
  if (attempt.markingStage !== "done") return { ...basics, state: "marking", steps: markingStepsFor(attempt.mode, attempt.markingStage) };
  const marking = await listAttemptMarking(db, attemptId, header.paperId);
  return { ...basics, state: "needs_check", waitingCount: marking.filter(isWaitingForCheck).length };
}

// ---------------------------------------------------------------------------
// Shared: the marked questions of an attempt
// ---------------------------------------------------------------------------

type Marked = { header: AttemptHeader; marking: MarkedQuestion[]; questions: (ResultQuestion & { outcomeId: string })[] };

async function loadMarked(db: Database, scope: AttemptScope, attemptId: string): Promise<Marked | null> {
  const header = await getAttemptHeader(db, attemptId, scope);
  if (!header || header.attempt.status !== "marked") return null;
  const marking = await listAttemptMarking(db, attemptId, header.paperId);
  const topics = await listQuestionTopics(db, marking.map((item) => item.question.id));
  const topicOf = new Map(topics.map((topic) => [topic.questionId, topic]));
  const questions = marking.map((item) => {
    const topic = topicOf.get(item.question.id);
    return {
      questionId: item.paperQuestionId,
      position: item.position,
      marks: item.marks,
      score: finalScoreOf(item) ?? 0,
      topicId: topic?.topicId ?? "other",
      topicLabel: topic?.topicLabel ?? "Other questions",
      skillLabel: topic?.skillLabel ?? "This kind of question",
      outcomeId: topic?.outcomeId ?? "",
    };
  });
  return { header, marking, questions };
}

// ---------------------------------------------------------------------------
// Parent results
// ---------------------------------------------------------------------------

export type ParentResult = Basics & {
  score: number;
  maxScore: number;
  /** "38/50" */
  scoreText: string;
  change: ResultChange;
  attention: { topicId: string; label: string; text: string }[];
  nextAction: ParentAction;
  topics: TopicRow[];
  /** "Finished 4 minutes over time", when it applies. */
  overTime: string | null;
  mistakeCount: number;
  markedPaperHref: string;
};

async function nextActionFor(db: Database, parentProfileId: string, header: AttemptHeader, rows: TopicRow[], context: Context): Promise<ParentAction> {
  const assessments = await listAssessmentsForParent(db, parentProfileId);
  const assessment = assessments.find((candidate) => candidate.id === header.assessmentId);
  const papers = assessment ? await listPapersForAssessments(db, [assessment.id]) : [];
  const home = await getParentHomeState(parentProfileId, context);
  const markedAt = (header.attempt.markedAt ?? new Date()).toISOString();
  // The mock in front of the parent counts as looked at; everything else is as Home sees it.
  const state: ParentActionState = {
    ...home,
    selectedChildId: header.attempt.childId,
    assessments: assessment
      ? [
          {
            id: assessment.id,
            childId: assessment.childId,
            name: assessment.name,
            subject: assessment.subject,
            date: assessment.date,
            scopeConfirmed: assessment.status === "scope_confirmed",
            papers: papers.filter((paper) => paper.status === "generated").map((paper) => ({ id: paper.id, number: paper.number, status: "ready" as const })),
          },
        ]
      : [],
    today: todayInSingapore(context.now),
    attempts: [
      {
        id: header.attempt.id,
        childId: header.attempt.childId,
        paperId: header.paperId,
        status: "marked",
        startedAt: markedAt,
        label: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
        resultId: header.attempt.id,
        resultSeen: true,
        unreviewedMistakes: 0,
      },
    ],
    practice: { outcomes: practiceOutcomesFromTopics(rows, markedAt), sessionsSinceLastMock: 0, minutesToday: 0 },
  };
  return resultNextAction(state, header.assessmentId);
}

/**
 * The parent's results. Null when the paper is not theirs or is not marked yet (the page then shows
 * where marking is instead). The order of what is returned is the order of the screen.
 */
export async function getParentResult(parentProfileId: string, attemptId: string, context: Context = {}): Promise<ParentResult | null> {
  const db = await resolveDb(context);
  const loaded = await loadMarked(db, { parentProfileId }, attemptId);
  if (!loaded) return null;
  const { header, questions } = loaded;
  const score = questions.reduce((sum, question) => sum + question.score, 0);
  const maxScore = questions.reduce((sum, question) => sum + question.marks, 0);

  // The previous marked mock of this assessment, by when it was marked.
  const earlier = (await listMarkedAttemptsOfAssessment(db, header.assessmentId, header.attempt.childId)).filter(
    (entry) => entry.attempt.id !== attemptId && (entry.attempt.markedAt?.getTime() ?? 0) <= (header.attempt.markedAt?.getTime() ?? 0),
  );
  const previous = earlier[earlier.length - 1];
  const previousTotals = previous ? await attemptTotals(db, previous.attempt.id, previous.attempt.paperId) : null;

  const topics = topicBreakdown(questions);
  const attention = topicsNeedingAttention(topics).map((row) => ({
    topicId: row.topicId,
    label: row.label,
    text: `${row.label}: ${row.marksLost === 1 ? "1 mark" : `${row.marksLost} marks`} missed`,
  }));
  return {
    ...basicsOf(header),
    score,
    maxScore,
    scoreText: scoreText(score, maxScore),
    change: changeFromPrevious({ score, maxScore }, previous && previousTotals ? { ...previousTotals, mockNumber: previous.mockNumber } : undefined),
    attention,
    nextAction: await nextActionFor(db, parentProfileId, header, topics, context),
    topics,
    overTime: overTimeText(header.attempt.overTimeSeconds),
    mistakeCount: questions.filter(isMistake).length,
    markedPaperHref: `/progress/results/${attemptId}/paper`,
  };
}

// ---------------------------------------------------------------------------
// Child results
// ---------------------------------------------------------------------------

export type ChildResult = Basics & {
  scoreText: string;
  headline: string;
  /** Up to three skills to learn, in the child's words. */
  thingsToLearn: string[];
  mistakeCount: number;
  reviewHref: string;
};

/** The child's results. Null when it is not their paper, or it is not marked yet. */
export async function getChildResult(childId: string, attemptId: string, context: Context = {}): Promise<ChildResult | null> {
  const loaded = await loadMarked(await resolveDb(context), { childId }, attemptId);
  if (!loaded) return null;
  const { header, questions } = loaded;
  const score = questions.reduce((sum, question) => sum + question.score, 0);
  const maxScore = questions.reduce((sum, question) => sum + question.marks, 0);
  const mistakeCount = questions.filter(isMistake).length;
  return {
    ...basicsOf(header),
    scoreText: scoreText(score, maxScore),
    headline: childHeadline({ score, maxScore, mistakeCount }),
    thingsToLearn: thingsToLearn(questions),
    mistakeCount,
    reviewHref: `/results/${attemptId}/paper`,
  };
}

// ---------------------------------------------------------------------------
// The marked paper
// ---------------------------------------------------------------------------

export type MarkedPaperEntry = {
  position: number;
  marks: number;
  score: number;
  mistake: boolean;
  /** "✓ 3/3" or "✗ 0/3": never colour alone. */
  markText: string;
  content: QuestionContent;
  /** What the child wrote, in one line. */
  answerLine: string;
  /** A picture of their working, served privately, or null. */
  workingUrl: string | null;
  correctAnswer: string;
  workedSolution: Block[];
  /** What happened, in a sentence or two. */
  whatHappened: string;
  /** A short explanation of the slip, when there is one. */
  explanation: string | null;
  /** The marker's one-sentence note for the parent. Never shown to the child. */
  parentNote: string | null;
  topicLabel: string;
  /** Where "Try one like this" goes. */
  tryHref: string;
};

export type MarkedPaper = Basics & {
  audience: Audience;
  entries: MarkedPaperEntry[];
  mistakeCount: number;
  imageUrls: Record<string, string>;
  backHref: string;
  /** Where to send the person once the last mistake has been gone through. */
  doneHref: string;
};

export async function getMarkedPaper(viewer: Viewer, attemptId: string, context: Context = {}): Promise<MarkedPaper | null> {
  const loaded = await loadMarked(await resolveDb(context), scopeOfViewer(viewer), attemptId);
  if (!loaded) return null;
  const { header, marking, questions } = loaded;
  const audience: Audience = viewer.kind;
  const byPosition = new Map(marking.map((item) => [item.position, item]));
  const resultQuestions = new Map(questions.map((question) => [question.position, question]));

  const imageUrls: Record<string, string> = {};
  const entries: MarkedPaperEntry[] = [];
  for (const ordered of orderForReview(questions)) {
    const item = byPosition.get(ordered.position) as MarkedQuestion;
    const result = resultQuestions.get(ordered.position) as (typeof questions)[number];
    const content = QuestionContentSchema.parse(item.question.content);
    const answer = AnswerSchema.parse(item.question.answer);
    const solution = WorkedSolutionSchema.safeParse(item.question.workedSolution);
    for (const key of referencedAssetKeys({ content: { stem: content.stem }, workedSolution: solution.success ? solution.data : [] })) {
      imageUrls[key] = `/api/attempts/${attemptId}/assets/${key}`;
    }
    const response = item.response;
    const answered = Boolean(response && (response.selectedOption || response.typedAnswer?.trim()));
    const childAnswer = childAnswerText({ selectedOption: response?.selectedOption ?? null, typedAnswer: response?.typedAnswer ?? null, typedUnit: response?.typedUnit ?? null });
    const correctAnswer = answerText(answer, content);
    const ai = [...item.history].reverse().find((decision) => decision.method === "ai_assisted");
    const mistake = ordered.score < ordered.marks;
    const errorType = (ai?.errorType ?? null) as Parameters<typeof explanationFor>[0];
    entries.push({
      position: item.position,
      marks: item.marks,
      score: ordered.score,
      mistake,
      markText: markText(ordered.score, item.marks),
      content,
      answerLine: childAnswer,
      workingUrl: response?.handwritingKey ? `/api/attempts/${attemptId}/working/${item.position}` : null,
      correctAnswer,
      workedSolution: solution.success ? solution.data : [],
      whatHappened: whatHappenedText({ audience, score: ordered.score, marks: item.marks, childAnswer, correctAnswer, answered }),
      explanation: mistake ? explanationFor(errorType) : null,
      parentNote: audience === "parent" && ai ? ai.reason : null,
      topicLabel: result.topicLabel,
      tryHref: audience === "parent" ? `/progress/practice?topic=${encodeURIComponent(result.topicId)}` : `/practice?outcome=${encodeURIComponent(result.outcomeId)}`,
    });
  }
  return {
    ...basicsOf(header),
    audience,
    entries,
    mistakeCount: entries.filter((entry) => entry.mistake).length,
    imageUrls,
    backHref: audience === "parent" ? `/progress/results/${attemptId}` : `/results/${attemptId}`,
    doneHref: audience === "parent" ? "/home" : "/today",
  };
}

// ---------------------------------------------------------------------------
// The parent's quick check
// ---------------------------------------------------------------------------

export type QuickCheck =
  | {
      state: "check";
      attemptId: string;
      childNickname: string;
      paperQuestionId: string;
      position: number;
      marks: number;
      /** "3 to check", or "Last one to check". */
      progressText: string;
      content: QuestionContent;
      imageUrls: Record<string, string>;
      childAnswer: string;
      workingUrl: string | null;
      correctAnswer: string;
      /** The marking scheme in plain words. */
      scheme: string[];
      /** What the marker would give and why, when it looked. Only ever a suggestion. */
      suggestion: { score: number; reason: string } | null;
      choices: number[];
    }
  | { state: "marking"; attemptId: string }
  | { state: "done"; attemptId: string; resultsReady: boolean };

/** The next answer waiting for the parent, one at a time. Null when the paper is not theirs. */
export async function getQuickCheck(parentProfileId: string, attemptId: string, context: Context = {}): Promise<QuickCheck | null> {
  const db = await resolveDb(context);
  const header = await getAttemptHeader(db, attemptId, { parentProfileId });
  if (!header) return null;
  const { attempt } = header;
  if (attempt.status === "assigned" || attempt.status === "in_progress") return null;
  if (attempt.status === "submitted" && attempt.markingStage !== "done") return { state: "marking", attemptId };
  const marking = await listAttemptMarking(db, attemptId, header.paperId);
  const waiting = marking.filter(isWaitingForCheck);
  const next = waiting[0];
  if (!next) return { state: "done", attemptId, resultsReady: attempt.status === "marked" };

  const content = QuestionContentSchema.parse(next.question.content);
  const answer = AnswerSchema.parse(next.question.answer);
  const scheme = MarkingSchemeSchema.parse(next.question.markingScheme);
  const ai = [...next.history].reverse().find((decision) => decision.method === "ai_assisted");
  const imageUrls: Record<string, string> = {};
  for (const key of referencedAssetKeys({ content: { stem: content.stem }, workedSolution: [] })) imageUrls[key] = `/api/attempts/${attemptId}/assets/${key}`;
  return {
    state: "check",
    attemptId,
    childNickname: header.childNickname,
    paperQuestionId: next.paperQuestionId,
    position: next.position,
    marks: next.marks,
    progressText: waiting.length === 1 ? "Last one to check" : `${waiting.length} to check`,
    content,
    imageUrls,
    childAnswer: childAnswerText({ selectedOption: next.response?.selectedOption ?? null, typedAnswer: next.response?.typedAnswer ?? null, typedUnit: next.response?.typedUnit ?? null }),
    workingUrl: next.response?.handwritingKey ? `/api/attempts/${attemptId}/working/${next.position}` : null,
    correctAnswer: answerText(answer, content),
    scheme: markingSchemeWords(scheme, next.marks),
    suggestion: ai ? { score: ai.score, reason: ai.reason } : null,
    choices: Array.from({ length: next.marks + 1 }, (_, mark) => mark),
  };
}

// ---------------------------------------------------------------------------
// Recent results, for Progress
// ---------------------------------------------------------------------------

export type RecentResult = { attemptId: string; label: string; childNickname: string; scoreText: string; href: string };

/** The newest marked mocks the viewer can open, newest first. */
export async function listRecentResults(viewer: Viewer, limit = 5, context: Context = {}): Promise<RecentResult[]> {
  const db = await resolveDb(context);
  const headers =
    viewer.kind === "parent"
      ? (await listAttemptHeadersForParent(db, viewer.parentProfileId)).filter((header) => header.attempt.status === "marked")
      : await listMarkedAttemptHeaders(db, viewer.childId);
  const newest = headers.sort((a, b) => (b.attempt.markedAt?.getTime() ?? 0) - (a.attempt.markedAt?.getTime() ?? 0)).slice(0, limit);
  const results: RecentResult[] = [];
  for (const header of newest) {
    const totals = await attemptTotals(db, header.attempt.id, header.paperId);
    if (!totals) continue;
    results.push({
      attemptId: header.attempt.id,
      label: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
      childNickname: header.childNickname,
      scoreText: scoreText(totals.score, totals.maxScore),
      href: viewer.kind === "parent" ? `/progress/results/${header.attempt.id}` : `/results/${header.attempt.id}`,
    });
  }
  return results;
}
