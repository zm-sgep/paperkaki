import { createHash, randomUUID } from "node:crypto";
import { buildAssessmentPlan } from "@/application/assessment-plan";
import {
  confirmScope,
  createAssessment,
  setAssessmentScope,
  setPaperFormat,
  setPaperSettings,
} from "@/application/commands/assessments";
import { InputError, NotFoundError } from "@/application/errors";
import { NOTICE_EXTRACTION_JOB, RETRYABLE_FAILURES } from "@/application/notice-processing";
import { loadPublishedTopics } from "@/application/notice-topics";
import {
  NOTICE_UPLOAD_LIMITS,
  TOO_MANY_PAGES_MESSAGE,
  UNREADABLE_PDF_MESSAGE,
  checkNoticeUpload,
  formatTotalMarks,
  normalisePaperFormat,
  sniffNoticeFile,
  validateAssessmentDate,
  validatePaperFormat,
  todayInSingapore,
  type PaperFormat,
  type SniffedFile,
} from "@/domain/assessments";
import { PAPER_LIMITS } from "@/domain/assessments/recommend";
import { recordAuditEvent } from "@/lib/audit";
import { getOwnedAssessment, getOwnedChild } from "@/repositories/postgres/assessments";
import {
  getOwnedSource,
  insertAssessmentSource,
  markSourceDeleted,
  requeueOwnedSource,
  updateSource,
} from "@/repositories/postgres/assessment-sources";
import { parsePaperFormat } from "@/schemas/paper-format";
import { AssessmentTypeSchema, NicknameSchema } from "@/schemas/assessment-setup";
import { StoredNoticeSchema } from "@/schemas/notice-extraction";
import { countPdfPages } from "@/services/pdf/inspect";
import { getStorage, type StorageService } from "@/services/storage";
import type { JobService } from "@/services/jobs";
import { createChildInTransaction, resolveCommandDb, selectChildInTransaction, type CommandContext } from "./children";

/**
 * School-notice commands (Milestone 5). Each takes the signed-in parent's id and works only on that
 * parent's own sources; anything else is "not found". The file is kept in private storage and never
 * linked from a page.
 */

const BUCKET = "assessment-source-uploads" as const;
const LEVEL = "P3";

export type NoticeContext = CommandContext & { storage?: StorageService };

export type UploadNoticeInput = {
  /** An existing child of this parent... */
  childId?: string | undefined;
  /** ...or the nickname of a first child to create in the same step. */
  newChildNickname?: string | undefined;
  /** The pages, in order. Only the bytes are used: file names are never kept. */
  files: { bytes: Uint8Array }[];
};

/**
 * Stores the notice privately, records it, and queues the reading job. Returns the source and the
 * job id; the caller starts the job after it has answered the parent (see the upload action).
 */
export async function uploadNotice(
  parentProfileId: string,
  input: UploadNoticeInput,
  jobs: Pick<JobService, "enqueue">,
  context: NoticeContext = {},
): Promise<{ sourceId: string; jobId: string }> {
  const db = await resolveCommandDb(context);
  const storage = context.storage ?? getStorage();

  const errors: Record<string, string> = {};
  if (!input.childId) {
    const nickname = NicknameSchema.safeParse(input.newChildNickname ?? "");
    if (!nickname.success) errors.nickname = nickname.error.issues[0]?.message ?? "Enter your child's name or nickname.";
  }

  const sniffed: SniffedFile[] = input.files.map((file) => sniffNoticeFile(file.bytes));
  const check = checkNoticeUpload(input.files.map((file, i) => ({ size: file.bytes.byteLength, sniffed: sniffed[i] ?? { kind: "unknown" as const } })));
  if (!check.ok) errors.file = check.message;
  if (Object.keys(errors).length > 0) throw new InputError(errors);
  if (!check.ok) throw new InputError(errors);

  let pageCount = input.files.length;
  if (check.kind === "pdf") {
    const pages = await countPdfPages(input.files[0]?.bytes ?? new Uint8Array());
    if (pages === null) throw new InputError({ file: UNREADABLE_PDF_MESSAGE });
    if (pages > NOTICE_UPLOAD_LIMITS.maxPages) throw new InputError({ file: TOO_MANY_PAGES_MESSAGE });
    pageCount = pages;
  }

  const hash = createHash("sha256");
  for (const file of input.files) hash.update(file.bytes);
  const sha256 = hash.digest("hex");
  const byteSize = input.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);

  const sourceId = randomUUID();
  const pages = input.files.map((file, i) => {
    const kind = sniffed[i];
    if (kind?.kind !== "known") throw new InputError({ file: "We can only read a PDF, or photos saved as JPEG or PNG." });
    return { bytes: file.bytes, mime: kind.mime, objectKey: `${parentProfileId}/${sourceId}/${i}.${kind.extension}` };
  });

  // Fail before anything is stored if the child is not this parent's.
  if (input.childId) {
    const child = await getOwnedChild(db, parentProfileId, input.childId);
    if (!child || child.archivedAt) throw new NotFoundError();
  }

  const written: string[] = [];
  try {
    for (const page of pages) {
      await storage.put({ bucket: BUCKET, key: page.objectKey, body: page.bytes, contentType: page.mime });
      written.push(page.objectKey);
    }
  } catch {
    await Promise.allSettled(written.map((key) => storage.delete({ bucket: BUCKET, key })));
    throw new InputError({ file: "We couldn't save that file. Please try again." });
  }

  try {
    return await db.transaction(async (tx) => {
      let childId = input.childId;
      if (childId) {
        const child = await getOwnedChild(tx, parentProfileId, childId);
        if (!child || child.archivedAt) throw new NotFoundError();
      } else {
        childId = (await createChildInTransaction(tx, parentProfileId, { nickname: input.newChildNickname ?? "", level: LEVEL }, context)).id;
      }
      await selectChildInTransaction(tx, parentProfileId, childId);
      const [first, ...rest] = pages;
      if (!first) throw new InputError({ file: "Choose the school notice to upload." });
      const source = await insertAssessmentSource(tx, {
        id: sourceId,
        parentProfileId,
        childId,
        bucket: BUCKET,
        objectKey: first.objectKey,
        extraFiles: rest.map((page) => ({ objectKey: page.objectKey, mime: page.mime })),
        mime: first.mime,
        sha256,
        byteSize,
        pageCount,
      });
      const job = await jobs.enqueue(NOTICE_EXTRACTION_JOB, { sourceId: source.id }, tx);
      await recordAuditEvent(tx, {
        action: "assessment_source.uploaded",
        entityType: "assessment_source",
        entityId: source.id,
        actorProfileId: parentProfileId,
        metadata: { mime: first.mime, pageCount, byteSize },
        requestId: context.requestId ?? null,
      });
      return { sourceId: source.id, jobId: job.id };
    });
  } catch (error) {
    await Promise.allSettled(written.map((key) => storage.delete({ bucket: BUCKET, key })));
    throw error;
  }
}

/** "Try again" with the same file after the reading service was unavailable or slow. */
export async function retryNotice(
  parentProfileId: string,
  sourceId: string,
  jobs: Pick<JobService, "enqueue">,
  context: NoticeContext = {},
): Promise<{ jobId: string }> {
  const db = await resolveCommandDb(context);
  return db.transaction(async (tx) => {
    const source = await getOwnedSource(tx, parentProfileId, sourceId);
    if (!source) throw new NotFoundError();
    if (source.status !== "failed" || !RETRYABLE_FAILURES.includes(source.failureCode ?? "")) {
      throw new InputError({ form: "This file needs to be replaced. Please try another file." });
    }
    await requeueOwnedSource(tx, parentProfileId, sourceId);
    const job = await jobs.enqueue(NOTICE_EXTRACTION_JOB, { sourceId }, tx);
    return { jobId: job.id };
  });
}

/** "Delete this file": removes the stored pages and clears what was read from them. */
export async function deleteNoticeFile(parentProfileId: string, sourceId: string, context: NoticeContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const storage = context.storage ?? getStorage();
  const source = await getOwnedSource(db, parentProfileId, sourceId);
  if (!source) throw new NotFoundError();
  // Remove the objects first: if this fails the row still points at them and the parent can try again.
  for (const key of [source.objectKey, ...source.extraFiles.map((file) => file.objectKey)]) {
    await storage.delete({ bucket: BUCKET, key });
  }
  await db.transaction(async (tx) => {
    const done = await markSourceDeleted(tx, parentProfileId, sourceId, context.now ?? new Date());
    if (!done) throw new NotFoundError();
    await recordAuditEvent(tx, {
      action: "assessment_source.file_deleted",
      entityType: "assessment_source",
      entityId: sourceId,
      actorProfileId: parentProfileId,
      metadata: {},
      requestId: context.requestId ?? null,
    });
  });
}

export type ConfirmNoticeInput = {
  type: string;
  /** Only used when the type is "other". */
  customName?: string | undefined;
  /** "YYYY-MM-DD". */
  date: string;
  /** Used when the notice gave no paper parts. */
  durationMinutes?: unknown;
  /** Curriculum topic codes the parent ticked. */
  topicCodes: readonly string[];
  /** The paper's parts and time as the parent left them, or nothing when there are none. */
  format?: unknown;
  /** Keep the format for this child's future papers of the same kind. Default true. */
  saveForFuture?: boolean | undefined;
};

/**
 * "Looks right": creates the assessment from the reviewed notice, saves the paper format, confirms
 * the topics and links the notice, all in one step. Everything is checked first so a mistake never
 * leaves half an assessment behind. Confirming twice returns the same assessment.
 */
export async function confirmNotice(
  parentProfileId: string,
  sourceId: string,
  input: ConfirmNoticeInput,
  context: NoticeContext = {},
): Promise<{ assessmentId: string }> {
  const db = await resolveCommandDb(context);
  return db.transaction(async (tx) => {
    const source = await getOwnedSource(tx, parentProfileId, sourceId);
    if (!source) throw new NotFoundError();
    if (source.assessmentId) return { assessmentId: source.assessmentId };
    if (source.status !== "succeeded" || !StoredNoticeSchema.safeParse(source.extraction).success) {
      throw new InputError({ form: "We're still reading this notice. Please wait a moment." });
    }

    const errors: Record<string, string> = {};
    const type = AssessmentTypeSchema.safeParse(input.type);
    if (!type.success) errors.type = type.error.issues[0]?.message ?? "Choose the assessment.";

    const dateCheck = validateAssessmentDate(input.date, todayInSingapore(context.now));
    if (!dateCheck.ok) errors.date = dateCheck.message;

    const published = await loadPublishedTopics(tx);
    if (!published) throw new InputError({ form: "Primary 3 Mathematics isn't available yet. Please try again later." });
    const byCode = new Map(published.topics.map((topic) => [topic.code, topic]));
    const topicIds = [...new Set(input.topicCodes)].flatMap((code) => byCode.get(code)?.topicId ?? []);
    if (topicIds.length === 0) errors.topics = "Tick at least one topic.";

    let format: PaperFormat | null = null;
    let duration: number | null = null;
    if (input.format !== undefined && input.format !== null && input.format !== "") {
      const parsed = parsePaperFormat(input.format);
      if (!parsed) {
        errors.format = "Check the parts of the paper and try again.";
      } else {
        format = normalisePaperFormat(parsed);
        for (const issue of validatePaperFormat(format)) {
          const key = issue.sectionIndex === undefined ? "format" : `part-${issue.sectionIndex}`;
          errors[key] = errors[key] ? `${errors[key]} ${issue.message}` : issue.message;
        }
      }
    } else {
      const minutes = Number(input.durationMinutes);
      if (input.durationMinutes === undefined || input.durationMinutes === "" || !Number.isInteger(minutes) || minutes < PAPER_LIMITS.minMinutes || minutes > PAPER_LIMITS.maxMinutes) {
        errors.duration = `Choose a time between ${PAPER_LIMITS.minMinutes} and ${PAPER_LIMITS.maxMinutes} minutes.`;
      } else {
        duration = minutes;
      }
    }
    if (Object.keys(errors).length > 0 || !type.success) throw new InputError(errors);

    const inner: CommandContext = { ...context, db: tx };
    const assessment = await createAssessment(
      parentProfileId,
      { childId: source.childId, type: type.data, customName: input.customName, date: input.date },
      inner,
    );
    await setAssessmentScope(parentProfileId, assessment.id, topicIds, inner);
    await confirmScope(parentProfileId, assessment.id, inner);
    if (format) {
      await setPaperFormat(parentProfileId, assessment.id, { choice: "custom", customFormat: format, saveForFuture: input.saveForFuture !== false }, inner);
    } else if (duration !== null) {
      const owned = await getOwnedAssessment(tx, parentProfileId, assessment.id);
      if (!owned) throw new NotFoundError();
      const plan = await buildAssessmentPlan(tx, owned);
      await setPaperSettings(
        parentProfileId,
        assessment.id,
        { totalMarks: plan.settings.totalMarks, durationMinutes: duration, difficulty: plan.settings.difficulty },
        inner,
      );
    }
    await updateSource(tx, sourceId, { assessmentId: assessment.id });
    await recordAuditEvent(tx, {
      action: "assessment_source.confirmed",
      entityType: "assessment_source",
      entityId: sourceId,
      actorProfileId: parentProfileId,
      metadata: { assessmentId: assessment.id, topicCount: topicIds.length, marks: format ? formatTotalMarks(format) : null },
      requestId: context.requestId ?? null,
    });
    return { assessmentId: assessment.id };
  });
}

