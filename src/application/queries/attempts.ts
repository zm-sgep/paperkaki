import { formatDuration, planQuestionInput, readStrokeDocument, serialiseStrokes, type StrokeDocument, attemptLabel, elapsedSecondsSince, questionCountText, marksText, MOCK_INSTRUCTIONS, type MockPaper, type MockQuestion } from "@/domain/attempts";
import { referencedAssetKeys } from "@/domain/questions";
import type { Database } from "@/repositories/postgres/client";
import {
  getAttemptHeader,
  type AttemptScope,
  listAttemptPaperQuestions,
  listAttemptResponses,
  type AttemptHeader,
} from "@/repositories/postgres/attempts";
import { getReadyDb } from "@/repositories/postgres/ready";
import type { AttemptSession } from "@/repositories/postgres/schema";
import { AnswerSchema, QuestionContentSchema, type Block } from "@/schemas/question-content";
import { getStorage, isStorageBucket, type StorageService } from "@/services/storage";
import type { CurrentChild } from "./current-child";

type Context = { db?: Database; now?: Date };

async function resolveDb(context: Context): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export type MockStartScreen = {
  attemptId: string;
  status: AttemptSession["status"];
  /** "Mathematics WA2 · Mock 1" */
  title: string;
  facts: { marks: string; duration: string; questions: string };
  instructions: readonly string[];
};

/** The calm screen before Start. Only the child's own attempt; anything else is null (a 404). */
export async function getMockStart(child: CurrentChild, attemptId: string, context: Context = {}): Promise<MockStartScreen | null> {
  const header = await getAttemptHeader(await resolveDb(context), attemptId, { childId: child.childId });
  if (!header) return null;
  return {
    attemptId,
    status: header.attempt.status,
    title: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
    facts: {
      marks: marksText(header.totalMarks),
      duration: formatDuration(header.attempt.timeLimitSeconds / 60),
      questions: questionCountText(header.questionCount),
    },
    instructions: MOCK_INSTRUCTIONS,
  };
}

/** What the server has saved for an attempt, as plain data. The screen turns it into its own snapshot. */
export type SavedAttempt = {
  /** Zero-based index of the question the child was on. */
  currentIndex: number;
  responses: Record<string, { selected?: "A" | "B" | "C" | "D"; typed?: string; strokes?: StrokeDocument }>;
  flagged: string[];
  /** The newest time any answer was saved, ISO 8601. */
  savedAt: string;
};

export type MockRunScreen =
  | { state: "submitted"; attemptId: string }
  | { state: "not_started"; attemptId: string }
  | {
      state: "in_progress";
      attemptId: string;
      paper: MockPaper;
      /** What the server has saved, to start from (the newer of this and the device's own copy is used). */
      saved: SavedAttempt;
      /** Seconds since Start, measured on the server when this page was made. */
      elapsedSeconds: number;
      /** Where the pictures in the questions are served (needs the child's session). */
      imageUrls: Record<string, string>;
    };

const EMPTY_TIME = new Date(0);

/** Everything Mock Mode needs, and nothing it must not have: no answers, no marking scheme, no solutions. */
export async function getMockRun(child: CurrentChild, attemptId: string, context: Context = {}): Promise<MockRunScreen | null> {
  const db = await resolveDb(context);
  const header = await getAttemptHeader(db, attemptId, { childId: child.childId });
  if (!header) return null;
  const { attempt } = header;
  if (attempt.status === "submitted" || attempt.status === "marked") return { state: "submitted", attemptId };
  if (attempt.status === "assigned" || !attempt.startedAt) return { state: "not_started", attemptId };

  const [items, responses] = await Promise.all([listAttemptPaperQuestions(db, header.paperId), listAttemptResponses(db, attemptId)]);

  const paperQuestions: MockQuestion[] = items.map((item) => {
    const content = QuestionContentSchema.parse(item.question.content);
    const answer = AnswerSchema.parse(item.question.answer);
    const plan = planQuestionInput({ questionType: item.question.questionType, marks: item.marks, answer });
    return {
      id: item.paperQuestionId,
      marks: item.marks,
      content,
      input: plan.input,
      working: true,
      ...(plan.working === "optional" ? { workingOptional: true } : {}),
    };
  });

  const imageUrls: Record<string, string> = {};
  for (const item of items) {
    const stem = QuestionContentSchema.parse(item.question.content).stem as Block[];
    for (const key of referencedAssetKeys({ content: { stem }, workedSolution: [] })) {
      imageUrls[key] = `/api/attempts/${attemptId}/assets/${key}`;
    }
  }

  const savedTimes = responses.map((row) => row.lastSavedAt.getTime());
  const savedResponses: SavedAttempt["responses"] = {};
  for (const row of responses) {
    const value: SavedAttempt["responses"][string] = {};
    if (row.selectedOption) value.selected = row.selectedOption as "A" | "B" | "C" | "D";
    if (row.typedAnswer) value.typed = row.typedAnswer;
    const read = row.strokes ? readStrokeDocument(row.strokes) : null;
    if (read && read.strokes.length > 0) value.strokes = serialiseStrokes(read.strokes, read.aspect);
    if (Object.keys(value).length > 0) savedResponses[row.paperQuestionId] = value;
  }
  const saved: SavedAttempt = {
    currentIndex: Math.max(0, attempt.currentPosition - 1),
    responses: savedResponses,
    flagged: responses.filter((row) => row.flagged).map((row) => row.paperQuestionId),
    savedAt: (savedTimes.length > 0 ? new Date(Math.max(...savedTimes)) : EMPTY_TIME).toISOString(),
  };
  const elapsedSeconds = elapsedSecondsSince(attempt.startedAt, context.now ?? new Date());

  return {
    state: "in_progress",
    attemptId,
    paper: {
      attemptId,
      title: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
      durationMinutes: attempt.timeLimitSeconds / 60,
      questions: paperQuestions,
    },
    saved,
    elapsedSeconds,
    imageUrls,
  };
}

export type ParentAttemptView = {
  attemptId: string;
  status: AttemptSession["status"];
  childId: string;
  childNickname: string;
  mockNumber: number;
  label: string;
  assessmentId: string;
  paperId: string;
  overTimeSeconds: number;
};

/** A parent's own child's attempt, for the parent's status page. Null when it is not theirs. */
export async function getParentAttemptView(parentProfileId: string, attemptId: string, context: Context = {}): Promise<ParentAttemptView | null> {
  const header: AttemptHeader | null = await getAttemptHeader(await resolveDb(context), attemptId, { parentProfileId });
  if (!header) return null;
  return {
    attemptId,
    status: header.attempt.status,
    childId: header.attempt.childId,
    childNickname: header.childNickname,
    mockNumber: header.paperNumber,
    label: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
    assessmentId: header.assessmentId,
    paperId: header.paperId,
    overTimeSeconds: header.attempt.overTimeSeconds,
  };
}

/**
 * A picture that appears in a question on this child's paper. Served only while the child's own
 * session is valid and only for keys the paper's questions use, so there is no link to keep or share.
 */
export async function getAttemptAsset(
  child: CurrentChild | AttemptScope,
  attemptId: string,
  key: string,
  context: Context & { storage?: StorageService } = {},
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const db = await resolveDb(context);
  const scope: AttemptScope = "parentProfileId" in child ? { parentProfileId: child.parentProfileId } : { childId: child.childId };
  const header = await getAttemptHeader(db, attemptId, scope);
  if (!header || header.attempt.status === "assigned") return null;
  const items = await listAttemptPaperQuestions(db, header.paperId);
  const allowed = new Set<string>();
  for (const item of items) {
    const content = QuestionContentSchema.safeParse(item.question.content);
    if (!content.success) continue;
    for (const assetKey of referencedAssetKeys({ content: { stem: content.data.stem }, workedSolution: [] })) allowed.add(assetKey);
  }
  if (!allowed.has(key)) return null;
  return (context.storage ?? getStorage()).get({ bucket: "question-assets", key });
}

/**
 * A picture of the working on one question of a paper that has been handed in: the snapshot of the pen
 * strokes, or the photographed page. Only the child it belongs to and their parent can see it, and it is
 * served through the app (no link is ever stored or shared).
 */
export async function getAttemptWorkingImage(
  scope: AttemptScope,
  attemptId: string,
  position: number,
  context: Context & { storage?: StorageService } = {},
): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!Number.isInteger(position) || position < 1) return null;
  const db = await resolveDb(context);
  const header = await getAttemptHeader(db, attemptId, scope);
  if (!header || header.attempt.status === "assigned" || header.attempt.status === "in_progress") return null;
  const items = await listAttemptPaperQuestions(db, header.paperId);
  const item = items.find((candidate) => candidate.position === position);
  if (!item) return null;
  const response = (await listAttemptResponses(db, attemptId)).find((row) => row.paperQuestionId === item.paperQuestionId);
  if (!response?.handwritingBucket || !response.handwritingKey || !isStorageBucket(response.handwritingBucket)) return null;
  return (context.storage ?? getStorage()).get({ bucket: response.handwritingBucket, key: response.handwritingKey });
}
