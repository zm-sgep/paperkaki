import { and, eq, inArray, sql } from "drizzle-orm";
import { InputError, NotFoundError } from "@/application/errors";
import { summaryOf } from "@/application/queries/papers";
import type { CurrentChild } from "@/application/queries/current-child";
import { markAttempt, type MarkableQuestion } from "@/domain/marking";
import {
  elapsedSecondsSince,
  markingResponseFor,
  overTimeSecondsFor,
  readStrokeDocument,
  serialiseStrokes,
  shownUnitOf,
  type SavedAnswer,
} from "@/domain/attempts";
import { recordAuditEvent } from "@/lib/audit";
import {
  findOpenAttempt,
  getAttemptHeader,
  listAttemptPaperQuestions,
  listAttemptResponses,
} from "@/repositories/postgres/attempts";
import { getOwnedAssessment } from "@/repositories/postgres/assessments";
import { getOwnedPaper } from "@/repositories/postgres/papers";
import { attemptResponses, attemptSessions, markingDecisions, type AttemptSession } from "@/repositories/postgres/schema";
import { AnswerSchema, MarkingSchemeSchema } from "@/schemas/question-content";
import { SaveProgressInputSchema, type SaveProgressInput } from "@/schemas/attempt";
import { renderStrokesPng, type SnapshotStroke } from "@/services/handwriting/render-png";
import { getStorage, type StorageService } from "@/services/storage";
import { resolveCommandDb, type CommandContext } from "./children";

/**
 * Attempts (M6, ARCHITECTURE section 10). A parent gives a mock to their child on the iPad; the child
 * starts it, the server keeps their answers as they work, and handing in freezes the attempt, saves a
 * picture of each piece of working and marks what can be marked by rule. The paper itself is never
 * touched. Everything a child does is scoped to that child's own attempts; anything else is "not found".
 */

export const HANDWRITING_BUCKET = "attempt-handwriting";

export type AttemptContext = CommandContext & { storage?: StorageService };

function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
    const fields = cause as Error & { code?: string; constraint?: string };
    if (fields.code === "23505" && (fields.constraint === constraint || cause.message.includes(constraint))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Parent: "Do it on iPad instead"
// ---------------------------------------------------------------------------

export type AssignResult = { attemptId: string; created: boolean };

/**
 * Gives one of this parent's mocks to their child, to do on the iPad. Pressing twice gives the same
 * attempt. A mock the child has already handed in is not given again: the next mock is a new paper.
 */
export async function assignMockToChild(parentProfileId: string, paperId: string, context: AttemptContext = {}): Promise<AssignResult> {
  const db = await resolveCommandDb(context);
  const paper = await getOwnedPaper(db, parentProfileId, paperId);
  if (!paper) throw new NotFoundError();
  const assessment = await getOwnedAssessment(db, parentProfileId, paper.assessmentId);
  if (!assessment || assessment.childArchived) throw new NotFoundError();

  const open = await findOpenAttempt(db, paperId, assessment.childId);
  if (open) return { attemptId: open.id, created: false };

  const { durationMinutes } = summaryOf(paper);
  if (durationMinutes <= 0) throw new InputError({ form: "We couldn't set the time for this mock. Please try again." });

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attemptSessions)
        .values({
          paperId,
          childId: assessment.childId,
          mode: "ipad",
          status: "assigned",
          assignedAt: context.now ?? new Date(),
          timeLimitSeconds: durationMinutes * 60,
          createdBy: parentProfileId,
        })
        .returning();
      if (!row) throw new Error("Attempt was not stored.");
      await recordAuditEvent(tx, {
        action: "attempt.assigned",
        entityType: "attempt",
        entityId: row.id,
        actorProfileId: parentProfileId,
        metadata: { paperId, mode: "ipad" },
        requestId: context.requestId ?? null,
      });
      return { attemptId: row.id, created: true };
    });
  } catch (error) {
    if (isUniqueViolation(error, "attempt_sessions_open_key")) {
      const raced = await findOpenAttempt(db, paperId, assessment.childId);
      if (raced) return { attemptId: raced.id, created: false };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Child: Start
// ---------------------------------------------------------------------------

export type StartResult = { status: AttemptSession["status"]; startedAt: Date | null };

/**
 * The child presses Start. The clock starts now, on the server, and never restarts: pressing Start
 * again, or opening the paper on another device, keeps the original time.
 */
export async function startAttempt(child: CurrentChild, attemptId: string, context: AttemptContext = {}): Promise<StartResult> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  return db.transaction(async (tx) => {
    const header = await getAttemptHeader(tx, attemptId, { childId: child.childId });
    if (!header) throw new NotFoundError();
    if (header.attempt.status !== "assigned") return { status: header.attempt.status, startedAt: header.attempt.startedAt };

    const [started] = await tx
      .update(attemptSessions)
      .set({ status: "in_progress", startedAt: now })
      .where(and(eq(attemptSessions.id, attemptId), eq(attemptSessions.status, "assigned")))
      .returning();
    if (started) {
      await recordAuditEvent(tx, {
        action: "attempt.started",
        entityType: "attempt",
        entityId: attemptId,
        actorProfileId: header.parentProfileId,
        metadata: { paperId: header.paperId },
        requestId: context.requestId ?? null,
      });
    }
    const current = started ?? (await getAttemptHeader(tx, attemptId, { childId: child.childId }))?.attempt;
    if (!current) throw new NotFoundError();
    return { status: current.status, startedAt: current.startedAt };
  });
}

// ---------------------------------------------------------------------------
// Child: autosave
// ---------------------------------------------------------------------------

export type SaveResult = { ok: true } | { ok: false; reason: "not_open" | "invalid" };

/** A device clock a little ahead is fine; one far ahead must not win against every later save. */
const FUTURE_SKEW_MS = 5_000;

/**
 * Saves what the child has done. Idempotent: the same answers sent twice change nothing. For each
 * question the newest write wins, judged by the time the device says it made the answer, so a late
 * arrival never overwrites newer work. A paper that is handed in accepts no more changes.
 */
export async function saveAttemptProgress(
  child: CurrentChild,
  attemptId: string,
  rawInput: unknown,
  context: AttemptContext = {},
): Promise<SaveResult> {
  const parsed = SaveProgressInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const input: SaveProgressInput = parsed.data;
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();

  const header = await getAttemptHeader(db, attemptId, { childId: child.childId });
  if (!header) throw new NotFoundError();
  if (header.attempt.status !== "in_progress") return { ok: false, reason: "not_open" };

  const paperQuestions = await listAttemptPaperQuestions(db, header.paperId);
  const byId = new Map(paperQuestions.map((row) => [row.paperQuestionId, row]));

  const savedAt = new Date(Math.min(Date.parse(input.savedAt), now.getTime() + FUTURE_SKEW_MS));
  const rows: (typeof attemptResponses.$inferInsert & { lastSavedAt: Date })[] = [];
  for (const response of input.responses) {
    const question = byId.get(response.paperQuestionId);
    if (!question) return { ok: false, reason: "invalid" };
    let strokes: Record<string, unknown> | null = null;
    if (response.strokes) {
      const read = readStrokeDocument(response.strokes);
      if (!read) return { ok: false, reason: "invalid" };
      strokes = read.strokes.length > 0 ? { ...serialiseStrokes(read.strokes, read.aspect) } : null;
    }
    const typed = response.typed && response.typed.trim() !== "" ? response.typed : null;
    const answer = AnswerSchema.safeParse(question.question.answer);
    const unit = typed && answer.success ? (shownUnitOf(answer.data) ?? null) : null;
    rows.push({
      attemptId,
      paperQuestionId: response.paperQuestionId,
      selectedOption: response.selected,
      typedAnswer: typed,
      typedUnit: unit,
      strokes,
      flagged: response.flagged,
      lastSavedAt: savedAt,
    });
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(attemptResponses)
        .values(row)
        .onConflictDoUpdate({
          target: [attemptResponses.attemptId, attemptResponses.paperQuestionId],
          set: {
            selectedOption: row.selectedOption,
            typedAnswer: row.typedAnswer,
            typedUnit: row.typedUnit,
            strokes: row.strokes,
            flagged: row.flagged,
            lastSavedAt: row.lastSavedAt,
          },
          // Last write wins by the device's own time; an older write arriving late changes nothing.
          setWhere: sql`${attemptResponses.lastSavedAt} <= ${row.lastSavedAt.toISOString()}::timestamptz`,
        });
    }
    // Only while the paper is still open: a submit that got in first has closed it.
    await tx
      .update(attemptSessions)
      .set({ currentPosition: Math.min(input.position, Math.max(1, paperQuestions.length)) })
      .where(and(eq(attemptSessions.id, attemptId), eq(attemptSessions.status, "in_progress")));
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Child: submit
// ---------------------------------------------------------------------------

export type SubmitResult = {
  ok: true;
  alreadySubmitted: boolean;
  /** How many answers need a person to look at them. Never shown to the child. */
  reviewCount: number;
};

export function handwritingKeyFor(parentProfileId: string, attemptId: string, position: number): string {
  return `parents/${parentProfileId}/attempts/${attemptId}/question-${position}.png`;
}

/**
 * Hands the paper in. In one transaction: the attempt closes (with the time it took and any time
 * past the limit), a PNG of each non-empty working area is stored privately, and every question is
 * marked by rule. Answers that cannot be marked with confidence stay `review_required` for a person.
 * Handing in twice does nothing the second time.
 */
export async function submitAttempt(child: CurrentChild, attemptId: string, context: AttemptContext = {}): Promise<SubmitResult> {
  const db = await resolveCommandDb(context);
  const storage = context.storage ?? getStorage();
  const now = context.now ?? new Date();

  return db.transaction(async (tx): Promise<SubmitResult> => {
    const header = await getAttemptHeader(tx, attemptId, { childId: child.childId });
    if (!header) throw new NotFoundError();

    // Lock the attempt: a save that is running waits, and one that follows sees the paper closed.
    const [locked] = await tx.select().from(attemptSessions).where(eq(attemptSessions.id, attemptId)).for("update");
    if (!locked) throw new NotFoundError();
    if (locked.status === "submitted" || locked.status === "marked") return { ok: true, alreadySubmitted: true, reviewCount: 0 };
    if (locked.status !== "in_progress" || !locked.startedAt) throw new NotFoundError();

    const paperQuestions = await listAttemptPaperQuestions(tx, header.paperId);
    const existing = await listAttemptResponses(tx, attemptId);
    const known = new Set(existing.map((row) => row.paperQuestionId));
    const missing = paperQuestions.filter((row) => !known.has(row.paperQuestionId));
    if (missing.length > 0) {
      // A question the child never touched still gets an answer row, so it has a mark.
      await tx
        .insert(attemptResponses)
        .values(missing.map((row) => ({ attemptId, paperQuestionId: row.paperQuestionId, lastSavedAt: now })))
        .onConflictDoNothing();
    }
    const responses = missing.length > 0 ? await listAttemptResponses(tx, attemptId) : existing;
    const responseByQuestion = new Map(responses.map((row) => [row.paperQuestionId, row]));

    // Pictures of the working, kept privately by key.
    const keys = new Map<string, string>();
    for (const item of paperQuestions) {
      const response = responseByQuestion.get(item.paperQuestionId);
      const read = response?.strokes ? readStrokeDocument(response.strokes) : null;
      if (!read || read.strokes.length === 0) continue;
      const key = handwritingKeyFor(header.parentProfileId, attemptId, item.position);
      await storage.put({
        bucket: HANDWRITING_BUCKET,
        key,
        body: renderStrokesPng({ strokes: read.strokes as readonly SnapshotStroke[], aspect: read.aspect }),
        contentType: "image/png",
      });
      keys.set(item.paperQuestionId, key);
    }
    for (const [paperQuestionId, key] of keys) {
      await tx
        .update(attemptResponses)
        .set({ handwritingBucket: HANDWRITING_BUCKET, handwritingKey: key })
        .where(and(eq(attemptResponses.attemptId, attemptId), eq(attemptResponses.paperQuestionId, paperQuestionId)));
    }

    // Mark by rule. The paper question id is the marking key, so every question has exactly one result.
    const markable: MarkableQuestion[] = paperQuestions.map((item) => {
      const answer = AnswerSchema.safeParse(item.question.answer);
      const scheme = MarkingSchemeSchema.safeParse(item.question.markingScheme);
      if (!answer.success || !scheme.success) throw new Error("A question on this paper cannot be marked.");
      return { id: item.paperQuestionId, questionType: item.question.questionType, marks: item.marks, answer: answer.data, markingScheme: scheme.data };
    });
    const saved: Record<string, SavedAnswer> = {};
    for (const item of paperQuestions) {
      const response = responseByQuestion.get(item.paperQuestionId);
      if (!response) continue;
      const read = response.strokes ? readStrokeDocument(response.strokes) : null;
      saved[item.paperQuestionId] = {
        selectedOption: response.selectedOption,
        typedAnswer: response.typedAnswer,
        typedUnit: response.typedUnit,
        hasStrokes: (read?.strokes.length ?? 0) > 0,
      };
    }
    const result = markAttempt(
      markable,
      Object.fromEntries(markable.map((question) => [question.id, markingResponseFor(saved[question.id])])),
    );
    await tx.insert(markingDecisions).values(
      result.results.map(({ questionId, decision }) => ({
        attemptResponseId: (responseByQuestion.get(questionId) as { id: string }).id,
        score: decision.score,
        maxScore: decision.maxScore,
        method: decision.method,
        confidence: decision.confidence,
        reason: decision.reason,
        reviewRequired: decision.reviewRequired,
        finalScore: decision.reviewRequired ? null : decision.score,
        decidedAt: now,
      })),
    );

    const elapsed = elapsedSecondsSince(locked.startedAt, now);
    await tx
      .update(attemptSessions)
      .set({
        status: "submitted",
        submittedAt: now,
        elapsedSeconds: elapsed,
        overTimeSeconds: overTimeSecondsFor(locked.timeLimitSeconds, elapsed),
      })
      .where(and(eq(attemptSessions.id, attemptId), inArray(attemptSessions.status, ["in_progress"])));
    await recordAuditEvent(tx, {
      action: "attempt.submitted",
      entityType: "attempt",
      entityId: attemptId,
      actorProfileId: header.parentProfileId,
      metadata: { paperId: header.paperId, reviewCount: result.totals.reviewCount, overTimeSeconds: overTimeSecondsFor(locked.timeLimitSeconds, elapsed) },
      requestId: context.requestId ?? null,
    });
    return { ok: true, alreadySubmitted: false, reviewCount: result.totals.reviewCount };
  });
}
