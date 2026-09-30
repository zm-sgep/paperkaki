import { and, eq } from "drizzle-orm";
import { MARK_ATTEMPT_JOB, resetFailedMarking, settleAttempt } from "@/application/attempt-marking";
import { InputError, NotFoundError } from "@/application/errors";
import { recordAuditEvent } from "@/lib/audit";
import { getAttemptHeader, isUuid } from "@/repositories/postgres/attempts";
import {
  insertMarkingReview,
  isWaitingForCheck,
  listAttemptMarking,
  setDecisionFinalScore,
} from "@/repositories/postgres/marking";
import { attemptSessions } from "@/repositories/postgres/schema";
import type { JobService } from "@/services/jobs";
import { resolveCommandDb, type CommandContext } from "./children";

/**
 * The parent's quick check (M7). One answer at a time: the parent picks the mark, it is added to the
 * append-only review history, and the answer's final score follows it. When the last waiting answer
 * has its mark the paper becomes marked and results are ready. Only the parent whose child it is can
 * check an answer; anything else is "not found".
 */

export type ReviewResult = {
  /** Answers still waiting for a check. */
  remaining: number;
  /** True once every answer has a mark that counts: results are ready. */
  resultsReady: boolean;
};

export async function saveMarkingReview(
  parentProfileId: string,
  attemptId: string,
  input: { paperQuestionId: string; score: number },
  context: CommandContext = {},
): Promise<ReviewResult> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  if (!isUuid(attemptId) || !isUuid(input.paperQuestionId)) throw new NotFoundError();
  const header = await getAttemptHeader(db, attemptId, { parentProfileId });
  if (!header) throw new NotFoundError();

  await db.transaction(async (tx) => {
    // Lock the attempt so two checks of the same paper cannot cross.
    const [locked] = await tx.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId)).for("update");
    if (!locked) throw new NotFoundError();
    const marking = await listAttemptMarking(tx, attemptId, locked.paperId);
    const question = marking.find((candidate) => candidate.paperQuestionId === input.paperQuestionId);
    if (!question || !question.decision || !question.response) throw new NotFoundError();
    if (!isWaitingForCheck(question)) throw new InputError({ form: "This answer has already been checked." });
    if (!Number.isInteger(input.score) || input.score < 0 || input.score > question.marks) {
      throw new InputError({ score: `Choose a mark from 0 to ${question.marks}.` });
    }
    await insertMarkingReview(tx, {
      attemptResponseId: question.response.id,
      markingDecisionId: question.decision.id,
      reviewerId: parentProfileId,
      score: input.score,
      maxScore: question.marks,
      createdAt: now,
    });
    await setDecisionFinalScore(tx, question.decision.id, input.score);
    await recordAuditEvent(tx, {
      action: "marking.answer_checked",
      entityType: "attempt",
      entityId: attemptId,
      actorProfileId: parentProfileId,
      metadata: { position: question.position, score: input.score, maxScore: question.marks },
      requestId: context.requestId ?? null,
    });
  });

  const settled = await settleAttempt(db, attemptId, now);
  if (settled.marked) {
    await recordAuditEvent(db, {
      action: "attempt.marked",
      entityType: "attempt",
      entityId: attemptId,
      actorProfileId: parentProfileId,
      metadata: { paperId: header.paperId },
      requestId: context.requestId ?? null,
    });
  }
  return { remaining: settled.waiting, resultsReady: settled.marked };
}

/** Marks the results as looked at, so Home stops asking. Only ever moves forward, and only for the parent's own child. */
export async function markResultSeenByParent(parentProfileId: string, attemptId: string, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const header = await getAttemptHeader(db, attemptId, { parentProfileId });
  if (!header || header.attempt.status !== "marked" || header.attempt.parentResultSeenAt) return;
  await db
    .update(attemptSessions)
    .set({ parentResultSeenAt: context.now ?? new Date() })
    .where(and(eq(attemptSessions.id, attemptId), eq(attemptSessions.status, "marked")));
}

/** The child looked at their results. */
export async function markResultSeenByChild(childId: string, attemptId: string, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const header = await getAttemptHeader(db, attemptId, { childId });
  if (!header || header.attempt.status !== "marked" || header.attempt.childResultSeenAt) return;
  await db
    .update(attemptSessions)
    .set({ childResultSeenAt: context.now ?? new Date() })
    .where(and(eq(attemptSessions.id, attemptId), eq(attemptSessions.status, "marked")));
}

/** The mistakes were gone through on the marked paper, by whoever was reviewing (the child or the parent). */
export async function markMistakesReviewed(
  who: { childId: string } | { parentProfileId: string },
  attemptId: string,
  context: CommandContext = {},
): Promise<void> {
  const db = await resolveCommandDb(context);
  const header = await getAttemptHeader(db, attemptId, who);
  if (!header || header.attempt.status !== "marked" || header.attempt.mistakesReviewedAt) return;
  await db
    .update(attemptSessions)
    .set({ mistakesReviewedAt: context.now ?? new Date() })
    .where(and(eq(attemptSessions.id, attemptId), eq(attemptSessions.status, "marked")));
}

/**
 * "Try again" for a photographed paper that could not be read. The pages are safe, so only reading
 * starts over. Returns the job to start once the parent has been answered, or null when there is nothing to retry.
 */
export async function retryMarking(
  parentProfileId: string,
  attemptId: string,
  jobs: Pick<JobService, "enqueue">,
  context: CommandContext = {},
): Promise<string | null> {
  const db = await resolveCommandDb(context);
  const header = await getAttemptHeader(db, attemptId, { parentProfileId });
  if (!header) throw new NotFoundError();
  if (!(await resetFailedMarking(db, attemptId))) return null;
  return (await jobs.enqueue(MARK_ATTEMPT_JOB, { attemptId })).id;
}
