import { attemptLabel, planQuestionInput, type AnswerInputKind } from "@/domain/attempts";
import { MASTERY_STATE_WORDS, starsForState } from "@/domain/mastery";
import {
  FEEDBACK_HEADING,
  isWeakOutcome,
  minutesText,
  practiceEndText,
  practiceProgressText,
  type ChildAction,
  type FeedbackResult,
} from "@/domain/recommendations";
import { referencedAssetKeys } from "@/domain/questions";
import type { Database } from "@/repositories/postgres/client";
import { listMarkedAttemptHeaders } from "@/repositories/postgres/attempts";
import { markingSummaries } from "@/repositories/postgres/marking";
import { getOpenPracticeSession, getPendingSuggestion, getPracticeSessionOfChild, listPracticeItems } from "@/repositories/postgres/practice";
import { getReadyDb } from "@/repositories/postgres/ready";
import { AnswerSchema, QuestionContentSchema, WorkedSolutionSchema, type Block, type QuestionContent } from "@/schemas/question-content";
import { getStorage, type StorageService } from "@/services/storage";
import { getChildToday } from "./child-today";
import type { CurrentChild } from "./current-child";
import { getLearningMap, recommendedTopic, type MapTopic } from "./learning-map";

/**
 * What the child's Practice screens show (M9, UX_SPEC section 8): one recommended card, the mistakes still
 * to fix, the topics that need work, and everything else tucked away; then the practice set itself, one
 * question at a time. Nothing here decides a mark or a state: it reads what the domain rules have decided.
 */

type Context = { db?: Database; now?: Date };

async function resolveDb(context: Context): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export type PracticeCard = {
  topicId: string;
  label: string;
  /** 0 to 4, drawn as stars: never a number. */
  stars: number;
  /** "Getting there": the same plain words a parent reads. */
  word: string;
};

export type PracticeHome = {
  /** Set when the child was sent here from a mistake ("Try one like this"). */
  requested: { outcomeId: string; label: string } | null;
  /** The primary card. `resume` when a set is waiting to be finished. */
  primary:
    | { kind: "resume"; sessionId: string; title: string; text: string }
    | { kind: "start"; topicId: string | null; outcomeId: string | null; title: string; text: string; suggested: boolean }
    | null;
  mistakes: { attemptId: string; label: string; count: number; href: string }[];
  toWorkOn: PracticeCard[];
  browse: PracticeCard[];
};

function cardOf(topic: MapTopic): PracticeCard {
  return { topicId: topic.topicId, label: topic.label, stars: starsForState(topic.mastery.state), word: MASTERY_STATE_WORDS[topic.mastery.state] };
}

export async function getPracticeHome(child: CurrentChild, options: { outcome?: string | undefined } = {}, context: Context = {}): Promise<PracticeHome> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  const map = await getLearningMap(child.childId, { db, now });
  const [open, suggestion, marked] = await Promise.all([
    getOpenPracticeSession(db, child.childId),
    getPendingSuggestion(db, child.childId),
    listMarkedAttemptHeaders(db, child.childId),
  ]);
  const summaries = await markingSummaries(db, marked.map((header) => header.attempt.id));
  const mistakes = marked
    .filter((header) => header.attempt.mistakesReviewedAt === null && (summaries.get(header.attempt.id)?.mistakes ?? 0) > 0)
    .map((header) => ({
      attemptId: header.attempt.id,
      label: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
      count: summaries.get(header.attempt.id)?.mistakes ?? 0,
      href: `/results/${header.attempt.id}/mistakes`,
    }));

  const topics = map?.topics ?? [];
  const requestedOutcome = options.outcome
    ? topics.flatMap((topic) => topic.testable).find((outcome) => outcome.outcomeId === options.outcome)
    : undefined;

  let primary: PracticeHome["primary"] = null;
  let recommended: MapTopic | undefined;
  if (open) {
    primary = { kind: "resume", sessionId: open.id, title: `Let's finish your ${open.focusLabel} practice`, text: "Pick up where you left off." };
  } else if (requestedOutcome) {
    primary = { kind: "start", topicId: null, outcomeId: requestedOutcome.outcomeId, title: `Try one like this`, text: `More practice on: ${requestedOutcome.label}`, suggested: false };
  } else if (suggestion) {
    const topic = topics.find((candidate) => candidate.topicId === suggestion.topicId);
    if (topic) {
      recommended = topic;
      primary = { kind: "start", topicId: topic.topicId, outcomeId: null, title: `Practise ${topic.label}`, text: "Your grown-up picked this for you. About 15 minutes.", suggested: true };
    }
  }
  if (!primary && map) {
    recommended = recommendedTopic(map, now);
    if (recommended) primary = { kind: "start", topicId: recommended.topicId, outcomeId: null, title: `Practise ${recommended.label}`, text: "About 15 minutes.", suggested: false };
  }

  const shown = new Set(recommended ? [recommended.topicId] : []);
  const toWorkOn = topics.filter((topic) => isWeakOutcome(topic.practice) && !shown.has(topic.topicId)).slice(0, 3);
  toWorkOn.forEach((topic) => shown.add(topic.topicId));
  return {
    requested: requestedOutcome ? { outcomeId: requestedOutcome.outcomeId, label: requestedOutcome.label } : null,
    primary,
    mistakes,
    toWorkOn: toWorkOn.map(cardOf),
    browse: topics.filter((topic) => !shown.has(topic.topicId)).map(cardOf),
  };
}

// ---------------------------------------------------------------------------
// The set itself
// ---------------------------------------------------------------------------

export type PracticeDot = { position: number; state: "right" | "wrong" | "unclear" | "todo"; current: boolean };

export type PracticeQuestionView = {
  position: number;
  marks: number;
  content: QuestionContent;
  input: AnswerInputKind;
  imageUrls: Record<string, string>;
};

export type PracticeRun =
  | {
      state: "question";
      sessionId: string;
      focusLabel: string;
      progressText: string;
      dots: PracticeDot[];
      question: PracticeQuestionView;
    }
  | { state: "finish"; sessionId: string; focusLabel: string; dots: PracticeDot[] }
  | { state: "done"; sessionId: string; focusLabel: string; endText: string; minutesText: string; next: ChildAction };

function dotsOf(items: { position: number; result: string | null }[], currentPosition: number | null): PracticeDot[] {
  return items.map((item) => ({
    position: item.position,
    state: item.result === "right" || item.result === "wrong" || item.result === "unclear" ? item.result : "todo",
    current: item.position === currentPosition,
  }));
}

/** The child's own set: the next question to answer, the finish screen, or the calm end screen. Null when it is not theirs. */
export async function getPracticeRun(child: CurrentChild, sessionId: string, context: Context = {}): Promise<PracticeRun | null> {
  const db = await resolveDb(context);
  const session = await getPracticeSessionOfChild(db, child.childId, sessionId);
  if (!session) return null;
  if (session.status === "completed") {
    const minutes = session.minutes ?? 1;
    const { action } = await getChildToday(child, context);
    return { state: "done", sessionId, focusLabel: session.focusLabel, endText: practiceEndText(session.focusLabel, minutes), minutesText: minutesText(minutes), next: action };
  }
  const items = await listPracticeItems(db, session.id);
  const current = items.find((item) => item.response.answeredAt === null);
  const rows = items.map((item) => ({ position: item.response.position, result: item.response.result }));
  if (!current) return { state: "finish", sessionId, focusLabel: session.focusLabel, dots: dotsOf(rows, null) };

  const content = QuestionContentSchema.parse(current.question.content);
  const answer = AnswerSchema.parse(current.question.answer);
  const plan = planQuestionInput({ questionType: current.question.questionType, marks: current.response.maxScore, answer });
  const imageUrls: Record<string, string> = {};
  for (const key of referencedAssetKeys({ content: { stem: content.stem }, workedSolution: [] })) imageUrls[key] = `/api/practice/${sessionId}/assets/${key}`;
  const solution = WorkedSolutionSchema.safeParse(current.question.workedSolution);
  for (const key of referencedAssetKeys({ content: { stem: [] as Block[] }, workedSolution: solution.success ? solution.data : [] })) {
    imageUrls[key] = `/api/practice/${sessionId}/assets/${key}`;
  }
  return {
    state: "question",
    sessionId,
    focusLabel: session.focusLabel,
    progressText: practiceProgressText(current.response.position, items.length),
    dots: dotsOf(rows, current.response.position),
    question: { position: current.response.position, marks: current.response.maxScore, content, input: plan.input, imageUrls },
  };
}

/** The heading a feedback panel shows, for screens that need it before an answer comes back. */
export function feedbackHeading(result: FeedbackResult): string {
  return FEEDBACK_HEADING[result];
}

/**
 * A picture used by a question in this child's set, or in its worked solution. Only the child it belongs
 * to gets it, and only for keys the set's questions use: there is no link to keep or share.
 */
export async function getPracticeAsset(
  child: CurrentChild,
  sessionId: string,
  key: string,
  context: Context & { storage?: StorageService } = {},
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const db = await resolveDb(context);
  const session = await getPracticeSessionOfChild(db, child.childId, sessionId);
  if (!session) return null;
  const allowed = new Set<string>();
  for (const item of await listPracticeItems(db, session.id)) {
    const content = QuestionContentSchema.safeParse(item.question.content);
    const solution = WorkedSolutionSchema.safeParse(item.question.workedSolution);
    if (!content.success) continue;
    for (const assetKey of referencedAssetKeys({ content: { stem: content.data.stem }, workedSolution: solution.success ? solution.data : [] })) allowed.add(assetKey);
  }
  if (!allowed.has(key)) return null;
  return (context.storage ?? getStorage()).get({ bucket: "question-assets", key });
}
