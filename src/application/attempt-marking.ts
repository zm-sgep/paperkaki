import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { recordAttemptEvidence } from "@/application/mastery";
import { markableOf } from "@/application/marking-support";
import { decisionFromAiMarking, markAttempt, type MarkableQuestion } from "@/domain/marking";
import { markingResponseFor, shownUnitOf, type SavedAnswer } from "@/domain/attempts";
import { answerText, blocksText, questionText } from "@/domain/questions";
import { logger } from "@/lib/logger";
import type { Database } from "@/repositories/postgres/client";
import { listAttemptResponses } from "@/repositories/postgres/attempts";
import {
  getAttemptForProcessing,
  insertMarkingDecisions,
  isWaitingForCheck,
  listAttemptMarking,
  type MarkedQuestion,
} from "@/repositories/postgres/marking";
import { attemptResponses, attemptSessions, printUploadPages } from "@/repositories/postgres/schema";
import { AnswerSchema, QuestionContentSchema, WorkedSolutionSchema } from "@/schemas/question-content";
import { AIError, getAIService, MARK_RESPONSE_PROMPT, type AIService, type NoticeFile, type PaperLayoutQuestion } from "@/services/ai";
import { JobFailure } from "@/services/jobs";
import { getStorage, isStorageBucket, type StorageService } from "@/services/storage";

/**
 * Marking after a paper is handed in (M7). The rules in src/domain/marking have already marked what
 * they can when the paper was submitted (or, for a photographed paper, once its answers were read).
 * This job then does the rest, in order:
 *
 *   1. a photographed paper: the AI service reads each question's final answer from the pages;
 *   2. the answers that rules could not settle and that have handwriting go to the AI marker, which
 *      only proposes a mark (a clear, high-confidence proposal settles it; anything else waits for
 *      the parent's quick check);
 *   3. the attempt is settled: marked when every answer has a mark that counts, otherwise it waits.
 *
 * Every step is safe to run again. When the AI service is off or fails, the answers simply wait for
 * the parent: nothing is lost.
 */

export const MARK_ATTEMPT_JOB = "attempt.mark";

export type MarkingDeps = { db: Database; ai?: AIService; storage?: StorageService; now?: Date };
type RunDeps = { ai: AIService; storage: StorageService; now: Date };

async function setStage(db: Database, attemptId: string, stage: "reading" | "marking" | "preparing" | "done" | "failed"): Promise<void> {
  await db.update(attemptSessions).set({ markingStage: stage }).where(eq(attemptSessions.id, attemptId));
}

/**
 * Finishes marking. The attempt becomes `marked` when every answer has a mark that counts, and
 * otherwise stays `submitted` for the parent's quick check. Safe to call again.
 */
export async function settleAttempt(db: Database, attemptId: string, now: Date): Promise<{ marked: boolean; waiting: number }> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId)).for("update");
    if (!locked) return { marked: false, waiting: 0 };
    const marking = await listAttemptMarking(tx, attemptId, locked.paperId);
    const waiting = marking.filter((question) => isWaitingForCheck(question) || question.decision === null).length;
    if (locked.status === "marked") return { marked: true, waiting: 0 };
    if (locked.status !== "submitted") return { marked: false, waiting };
    if (waiting === 0 && marking.length > 0) {
      await tx.update(attemptSessions).set({ status: "marked", markedAt: now, markingStage: "done" }).where(eq(attemptSessions.id, attemptId));
      // The mark that counts is final now, so the answers become evidence of what the child can do.
      await recordAttemptEvidence(tx, attemptId, now);
      return { marked: true, waiting: 0 };
    }
    await tx.update(attemptSessions).set({ markingStage: "done" }).where(eq(attemptSessions.id, attemptId));
    return { marked: false, waiting };
  });
}

function layoutOf(question: MarkedQuestion): PaperLayoutQuestion {
  const answer = AnswerSchema.parse(question.question.answer);
  const unit = shownUnitOf(answer);
  return { position: question.position, kind: answer.kind, ...(unit ? { unit } : {}), marks: question.marks };
}

const OPTION = /^\(?\s*([A-Da-d])\s*\)?\.?$/;

/** What was read for one question, turned into what marking takes. */
function savedFromReading(question: MarkedQuestion, read: { answerText: string; confident: boolean; hasWorking: boolean } | undefined) {
  const answer = AnswerSchema.parse(question.question.answer);
  const text = (read?.answerText ?? "").trim();
  const option = OPTION.exec(text)?.[1]?.toUpperCase() ?? null;
  const isMcq = answer.kind === "mcq";
  const saved: SavedAnswer = {
    selectedOption: isMcq ? option : null,
    typedAnswer: text === "" || (isMcq && option !== null) ? null : text,
    typedUnit: text !== "" && !isMcq ? (shownUnitOf(answer) ?? null) : null,
    hasStrokes: read?.hasWorking ?? false,
  };
  return { saved, unclear: read !== undefined && !read.confident && text !== "" };
}

/** Step 1 for a photographed paper: read the pages, store each answer, and mark by rule. */
async function readAndMarkPages(db: Database, deps: RunDeps, attemptId: string, paperId: string): Promise<void> {
  const marking = await listAttemptMarking(db, attemptId, paperId);
  // Already read (a retry after the reading step finished): nothing to do.
  if (marking.every((question) => question.decision !== null)) return;

  const pages = await db.select().from(printUploadPages).where(eq(printUploadPages.attemptId, attemptId)).orderBy(asc(printUploadPages.position));
  if (pages.length === 0) throw new JobFailure("no_pages");
  const files: NoticeFile[] = [];
  const hash = createHash("sha256");
  for (const page of pages) {
    if (!isStorageBucket(page.bucket)) throw new JobFailure("file_missing");
    const stored = await deps.storage.get({ bucket: page.bucket, key: page.objectKey });
    if (!stored) throw new JobFailure("file_missing");
    files.push({ bytes: stored.body, mime: page.mime });
    hash.update(stored.body);
  }

  let read;
  try {
    read = await deps.ai.readAnswers({ pages: files, sha256: hash.digest("hex"), questions: marking.map(layoutOf) });
  } catch (error) {
    throw new JobFailure(error instanceof AIError ? error.code : "internal");
  }
  const byPosition = new Map(read.answers.map((answer) => [answer.position, answer]));

  const rows = marking.map((question) => {
    const answer = byPosition.get(question.position);
    const { saved, unclear } = savedFromReading(question, answer && { answerText: answer.answerText, confident: answer.confident, hasWorking: answer.hasWorking ?? false });
    const page = pages[Math.min(pages.length, Math.max(1, answer?.page ?? 1)) - 1] as (typeof pages)[number];
    return { question, saved, unclear, page };
  });

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(attemptResponses)
        .values({
          attemptId,
          paperQuestionId: row.question.paperQuestionId,
          selectedOption: row.saved.selectedOption,
          typedAnswer: row.saved.typedAnswer,
          typedUnit: row.saved.typedUnit,
          lastSavedAt: deps.now,
          // The page the answer is on stands in for a picture of the working: a person or the AI marker can look at it.
          handwritingBucket: row.page.bucket,
          handwritingKey: row.page.objectKey,
        })
        .onConflictDoNothing();
    }
    const responses = await listAttemptResponses(tx, attemptId);
    const responseByQuestion = new Map(responses.map((response) => [response.paperQuestionId, response]));
    const markable: MarkableQuestion[] = rows.map((row) => markableOf(row.question));
    const result = markAttempt(
      markable,
      Object.fromEntries(
        rows.map((row) => [row.question.paperQuestionId, { ...markingResponseFor(row.saved), ...(row.unclear ? { answerUnclear: true } : {}) }]),
      ),
    );
    await insertMarkingDecisions(
      tx,
      result.results.map(({ questionId, decision }) => ({
        attemptResponseId: (responseByQuestion.get(questionId) as { id: string }).id,
        score: decision.score,
        maxScore: decision.maxScore,
        method: decision.method,
        confidence: decision.confidence,
        reason: decision.reason,
        reviewRequired: decision.reviewRequired,
        finalScore: decision.reviewRequired ? null : decision.score,
        decidedAt: deps.now,
      })),
    );
  });
}

function schemeOf(question: MarkedQuestion) {
  const scheme = markableOf(question).markingScheme;
  return { method: scheme.method, partialMarks: (scheme.partialMarks ?? []).map((partial) => ({ marks: partial.marks, criterion: partial.criterion })) };
}

/** Step 2: the AI marker looks at what rules could not settle. It proposes; rules decide what to do with the proposal. */
async function markUnsettledWithAI(db: Database, deps: RunDeps, attemptId: string, paperId: string): Promise<void> {
  const marking = await listAttemptMarking(db, attemptId, paperId);
  for (const question of marking) {
    const { decision, response } = question;
    if (!decision || !response || !isWaitingForCheck(question) || decision.method !== "needs_review") continue;
    if (question.history.some((entry) => entry.method === "ai_assisted")) continue;
    if (!response.handwritingBucket || !response.handwritingKey || !isStorageBucket(response.handwritingBucket)) continue;
    const picture = await deps.storage.get({ bucket: response.handwritingBucket, key: response.handwritingKey });
    if (!picture) continue;

    const content = QuestionContentSchema.parse(question.question.content);
    const answer = AnswerSchema.parse(question.question.answer);
    const solution = WorkedSolutionSchema.safeParse(question.question.workedSolution);
    let proposal;
    try {
      proposal = await deps.ai.markResponse({
        questionText: questionText(content),
        marks: question.marks,
        markingScheme: schemeOf(question),
        correctAnswer: answerText(answer, content),
        workedSolution: solution.success ? blocksText(solution.data) : "",
        childAnswer: response.selectedOption ?? response.typedAnswer ?? null,
        working: { bytes: picture.body, mime: picture.contentType },
      });
    } catch (error) {
      // Off, unreachable or unreadable: the answer stays for the parent, and the other answers still get their turn.
      logger.warn({ code: error instanceof AIError ? error.code : "internal" }, "An answer was left for a quick check");
      if (error instanceof AIError && error.code === "disabled") return;
      continue;
    }
    const proposed = decisionFromAiMarking({ marks: question.marks }, proposal);
    await insertMarkingDecisions(db, [
      {
        attemptResponseId: response.id,
        score: proposed.score,
        maxScore: proposed.maxScore,
        method: "ai_assisted",
        confidence: proposed.confidence,
        reason: proposed.reason,
        reviewRequired: proposed.reviewRequired,
        finalScore: proposed.reviewRequired ? null : proposed.score,
        decidedAt: deps.now,
        promptVersion: MARK_RESPONSE_PROMPT.version,
        errorType: proposed.errorType ?? null,
      },
    ]);
  }
}

/**
 * The marking job for one attempt. Throws a `JobFailure` when the paper could not be read (the stage
 * becomes "failed" and the parent is offered "Try again"); every other outcome ends with the attempt settled.
 */
export async function processAttemptMarking(attemptId: string, deps: MarkingDeps): Promise<void> {
  const { db } = deps;
  const found = await getAttemptForProcessing(db, attemptId);
  if (!found || found.attempt.status !== "submitted") return;
  const run: RunDeps = { ai: deps.ai ?? getAIService(), storage: deps.storage ?? getStorage(), now: deps.now ?? new Date() };

  if (found.attempt.mode === "print_upload") {
    await setStage(db, attemptId, "reading");
    try {
      await readAndMarkPages(db, run, attemptId, found.paperId);
    } catch (error) {
      await setStage(db, attemptId, "failed");
      throw error;
    }
  }
  await setStage(db, attemptId, "marking");
  await markUnsettledWithAI(db, run, attemptId, found.paperId);
  await setStage(db, attemptId, "preparing");
  await settleAttempt(db, attemptId, run.now);
}

/** Sends a failed photographed paper back to the start of reading. Only when it failed. */
export async function resetFailedMarking(db: Database, attemptId: string): Promise<boolean> {
  const rows = await db
    .update(attemptSessions)
    .set({ markingStage: "reading" })
    .where(and(eq(attemptSessions.id, attemptId), eq(attemptSessions.markingStage, "failed"), eq(attemptSessions.status, "submitted")))
    .returning({ id: attemptSessions.id });
  return rows.length > 0;
}
