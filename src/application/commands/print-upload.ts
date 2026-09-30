import { createHash, randomUUID } from "node:crypto";
import { MARK_ATTEMPT_JOB } from "@/application/attempt-marking";
import { InputError, NotFoundError } from "@/application/errors";
import { summaryOf } from "@/application/queries/papers";
import {
  HEIC_PAGE_MESSAGE,
  PDF_WITH_PHOTOS_MESSAGE,
  PRINT_UPLOAD_LIMITS,
  UNKNOWN_PAGE_MESSAGE,
  assessPage,
  moveId,
  orderPages,
  readImageSize,
  sniffPageFile,
} from "@/domain/attempts";
import { recordAuditEvent } from "@/lib/audit";
import { getOwnedAssessment } from "@/repositories/postgres/assessments";
import { findOpenAttempt } from "@/repositories/postgres/attempts";
import { getOwnedPaper } from "@/repositories/postgres/papers";
import {
  attachPagesToAttempt,
  deleteDraftPage,
  getDraftPage,
  insertDraftPage,
  listDraftPages,
  setDetectedPage,
  setPositions,
} from "@/repositories/postgres/print-upload";
import { attemptSessions } from "@/repositories/postgres/schema";
import { AIError, getAIService, isPaperUploadAvailable, type AIService } from "@/services/ai";
import type { JobService } from "@/services/jobs";
import { countPdfPages } from "@/services/pdf/inspect";
import { getStorage, type StorageService } from "@/services/storage";
import { resolveCommandDb, type CommandContext } from "./children";

/**
 * Uploading a finished, printed paper (M7). The parent adds photos of the pages (or one PDF); each page
 * is stored privately, checked by simple rules, and put in order (by the number printed in the footer
 * when it can be read). "Submit for marking" then creates the attempt and starts marking. Only the
 * parent's own papers work; anything else is "not found".
 */

export const PRINT_UPLOAD_BUCKET = "submission-uploads" as const;

export type UploadContext = CommandContext & { storage?: StorageService; ai?: AIService };

async function ownedPaperAndChild(db: Awaited<ReturnType<typeof resolveCommandDb>>, parentProfileId: string, paperId: string) {
  const paper = await getOwnedPaper(db, parentProfileId, paperId);
  if (!paper) throw new NotFoundError();
  const assessment = await getOwnedAssessment(db, parentProfileId, paper.assessmentId);
  if (!assessment || assessment.childArchived) throw new NotFoundError();
  return { paper, childId: assessment.childId };
}

export type AddedPage = { pageId: string; problem: "blurry" | "rotated" | "small" | null };

/** Stores one photo (or the PDF) of the finished paper, checks it, and puts the pages in order. */
export async function addUploadPage(
  parentProfileId: string,
  paperId: string,
  input: { bytes: Uint8Array; /** How sharp the browser found the photo. */ sharpness?: number | null },
  context: UploadContext = {},
): Promise<AddedPage> {
  const db = await resolveCommandDb(context);
  const storage = context.storage ?? getStorage();
  await ownedPaperAndChild(db, parentProfileId, paperId);

  const kind = sniffPageFile(input.bytes);
  if (kind.kind === "heic") throw new InputError({ file: HEIC_PAGE_MESSAGE });
  if (kind.kind === "unknown") throw new InputError({ file: UNKNOWN_PAGE_MESSAGE });
  if (input.bytes.byteLength === 0) throw new InputError({ file: "That file is empty. Please choose it again." });
  if (input.bytes.byteLength > PRINT_UPLOAD_LIMITS.maxBytes) throw new InputError({ file: "That file is too big. Please choose one under 10 MB." });

  const existing = await listDraftPages(db, parentProfileId, paperId);
  if (existing.length >= PRINT_UPLOAD_LIMITS.maxPages) throw new InputError({ file: `You can add up to ${PRINT_UPLOAD_LIMITS.maxPages} pages.` });
  if (kind.kind === "pdf" && existing.length > 0) throw new InputError({ file: PDF_WITH_PHOTOS_MESSAGE });
  if (kind.kind !== "pdf" && existing.some((page) => page.mime === "application/pdf")) throw new InputError({ file: PDF_WITH_PHOTOS_MESSAGE });

  let width: number | null = null;
  let height: number | null = null;
  let problem: AddedPage["problem"] = null;
  if (kind.kind === "pdf") {
    if ((await countPdfPages(input.bytes)) === null) throw new InputError({ file: "We couldn't open this PDF. Please try another file." });
  } else {
    const size = readImageSize(input.bytes);
    width = size?.width ?? null;
    height = size?.height ?? null;
    problem = assessPage({ width, height, sharpness: input.sharpness ?? null });
  }

  const pageId = randomUUID();
  const key = `parents/${parentProfileId}/papers/${paperId}/pages/${pageId}.${kind.extension}`;
  try {
    await storage.put({ bucket: PRINT_UPLOAD_BUCKET, key, body: input.bytes, contentType: kind.mime });
  } catch {
    throw new InputError({ file: "We couldn't save that page. Please try again." });
  }
  const now = context.now ?? new Date();
  await insertDraftPage(db, {
    id: pageId,
    paperId,
    parentProfileId,
    position: existing.length + 1,
    bucket: PRINT_UPLOAD_BUCKET,
    objectKey: key,
    mime: kind.mime,
    byteSize: input.bytes.byteLength,
    width,
    height,
    problem,
    createdAt: now,
  });

  // Put the pages in order by the number in the footer, when it can be read. Never blocks adding the page.
  if (kind.kind !== "pdf" && (context.ai !== undefined || isPaperUploadAvailable())) {
    try {
      const ai = context.ai ?? getAIService();
      const read = await ai.readPageNumbers({
        pages: [{ bytes: input.bytes, mime: kind.mime }],
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
      });
      await setDetectedPage(db, pageId, read.pages[0]?.pageNumber ?? 0);
      await reorderByFooter(db, parentProfileId, paperId);
    } catch (error) {
      if (!(error instanceof AIError)) throw error;
    }
  }
  return { pageId, problem };
}

async function reorderByFooter(db: Awaited<ReturnType<typeof resolveCommandDb>>, parentProfileId: string, paperId: string): Promise<void> {
  const pages = await listDraftPages(db, parentProfileId, paperId);
  await setPositions(db, orderPages(pages.map((page) => ({ id: page.id, position: page.position, detectedPage: page.detectedPage }))));
}

/** Takes a page off the grid (to retake it, or because it is not part of the paper). */
export async function removeUploadPage(parentProfileId: string, paperId: string, pageId: string, context: UploadContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const storage = context.storage ?? getStorage();
  await ownedPaperAndChild(db, parentProfileId, paperId);
  const page = await getDraftPage(db, parentProfileId, paperId, pageId);
  if (!page) throw new NotFoundError();
  await deleteDraftPage(db, page.id);
  await storage.delete({ bucket: PRINT_UPLOAD_BUCKET, key: page.objectKey }).catch(() => undefined);
  const rest = await listDraftPages(db, parentProfileId, paperId);
  await setPositions(db, rest.map((row) => row.id));
}

/** Moves a page one step earlier or later on the grid. */
export async function movePage(parentProfileId: string, paperId: string, pageId: string, direction: "earlier" | "later", context: UploadContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  await ownedPaperAndChild(db, parentProfileId, paperId);
  const pages = await listDraftPages(db, parentProfileId, paperId);
  if (!pages.some((page) => page.id === pageId)) throw new NotFoundError();
  await setPositions(db, moveId(pages.map((page) => page.id), pageId, direction));
}

/** Sets the order after a page was dragged. The ids must be exactly the pages on the grid. */
export async function reorderPages(parentProfileId: string, paperId: string, orderedIds: readonly string[], context: UploadContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  await ownedPaperAndChild(db, parentProfileId, paperId);
  const pages = await listDraftPages(db, parentProfileId, paperId);
  const same = orderedIds.length === pages.length && new Set(orderedIds).size === pages.length && pages.every((page) => orderedIds.includes(page.id));
  if (!same) throw new InputError({ form: "The pages changed. Please try again." });
  await setPositions(db, orderedIds);
}

export type SubmitUploadResult = { attemptId: string; jobId: string };

/**
 * "Submit for marking": creates the attempt (mode `print_upload`), fixes the pages to it and queues the
 * job that reads the answers and marks them. The caller starts the job after answering the parent.
 */
export async function submitPrintUpload(
  parentProfileId: string,
  paperId: string,
  jobs: Pick<JobService, "enqueue">,
  context: UploadContext = {},
): Promise<SubmitUploadResult> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const { paper, childId } = await ownedPaperAndChild(db, parentProfileId, paperId);
  const pages = await listDraftPages(db, parentProfileId, paperId);
  if (pages.length === 0) throw new InputError({ form: "Add at least one page first." });
  if (await findOpenAttempt(db, paperId, childId)) {
    throw new InputError({ form: `${paper.childNickname} already has this mock on the iPad. Finish it there, or upload the printed paper for a different mock.` });
  }
  const { durationMinutes } = summaryOf(paper);
  if (durationMinutes <= 0) throw new InputError({ form: "We couldn't read the time for this mock. Please try again." });

  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .insert(attemptSessions)
      .values({
        paperId,
        childId,
        mode: "print_upload",
        status: "submitted",
        assignedAt: now,
        startedAt: now,
        submittedAt: now,
        timeLimitSeconds: durationMinutes * 60,
        markingStage: "reading",
        createdBy: parentProfileId,
      })
      .returning();
    if (!attempt) throw new Error("Attempt was not stored.");
    await attachPagesToAttempt(tx, parentProfileId, paperId, attempt.id);
    const job = await jobs.enqueue(MARK_ATTEMPT_JOB, { attemptId: attempt.id }, tx);
    await recordAuditEvent(tx, {
      action: "attempt.uploaded",
      entityType: "attempt",
      entityId: attempt.id,
      actorProfileId: parentProfileId,
      metadata: { paperId, pageCount: pages.length, mode: "print_upload" },
      requestId: context.requestId ?? null,
    });
    return { attemptId: attempt.id, jobId: job.id };
  });
}

/** Removes every draft page of one paper (used when the parent starts over). */
export async function clearUploadPages(parentProfileId: string, paperId: string, context: UploadContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  const storage = context.storage ?? getStorage();
  await ownedPaperAndChild(db, parentProfileId, paperId);
  const pages = await listDraftPages(db, parentProfileId, paperId);
  if (pages.length === 0) return;
  await Promise.all(pages.map((page) => storage.delete({ bucket: PRINT_UPLOAD_BUCKET, key: page.objectKey }).catch(() => undefined)));
  for (const page of pages) await deleteDraftPage(db, page.id);
}
