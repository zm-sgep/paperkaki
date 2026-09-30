import { PRINT_UPLOAD_BUCKET } from "@/application/commands/print-upload";
import { attemptLabel, pageCountNote, problemText, type PageProblem } from "@/domain/attempts";
import type { Database } from "@/repositories/postgres/client";
import { findOpenAttempt } from "@/repositories/postgres/attempts";
import { getOwnedAssessment } from "@/repositories/postgres/assessments";
import { getOwnedPaper } from "@/repositories/postgres/papers";
import { getOwnedPage, listDraftPages } from "@/repositories/postgres/print-upload";
import { getReadyDb } from "@/repositories/postgres/ready";
import { isPaperUploadAvailable } from "@/services/ai";
import { countPdfPages } from "@/services/pdf/inspect";
import { getStorage, isStorageBucket, type StorageService } from "@/services/storage";

type Context = { db?: Database; storage?: StorageService };

export type UploadPageView = {
  id: string;
  /** "Page 3" */
  label: string;
  thumbnailUrl: string;
  isPdf: boolean;
  /** Exactly what to fix, only for a page with a problem. */
  problem: { kind: PageProblem; text: string } | null;
};

export type UploadScreen = {
  paperId: string;
  assessmentId: string;
  mockNumber: number;
  childNickname: string;
  /** "Mathematics WA2 · Mock 1" */
  label: string;
  available: boolean;
  /** Set when the mock cannot be uploaded right now, with the reason in a parent's words. */
  blocked: string | null;
  pages: UploadPageView[];
  /** A note when the number of pages is not the paper's. */
  countNote: string | null;
  /** How many pages the printed paper has, when known. */
  expectedPages: number | null;
  backHref: string;
};

/** The upload screen for one of the parent's own mocks. Null when it is not theirs. */
export async function getUploadScreen(parentProfileId: string, assessmentId: string, paperId: string, context: Context = {}): Promise<UploadScreen | null> {
  const db = context.db ?? (await getReadyDb());
  const paper = await getOwnedPaper(db, parentProfileId, paperId);
  if (!paper || paper.assessmentId !== assessmentId) return null;
  const assessment = await getOwnedAssessment(db, parentProfileId, assessmentId);
  if (!assessment) return null;
  const pages = await listDraftPages(db, parentProfileId, paperId);

  // The pages of the printed paper, counted from the paper's own PDF.
  let expectedPages: number | null = null;
  if (isStorageBucket(paper.studentPdfBucket)) {
    const stored = await (context.storage ?? getStorage()).get({ bucket: paper.studentPdfBucket, key: paper.studentPdfKey });
    if (stored) expectedPages = await countPdfPages(stored.body);
  }
  const isPdf = pages.some((page) => page.mime === "application/pdf");
  const actualPages = isPdf ? (expectedPages ?? pages.length) : pages.length;
  const open = await findOpenAttempt(db, paperId, assessment.childId);

  return {
    paperId,
    assessmentId,
    mockNumber: paper.number,
    childNickname: paper.childNickname,
    label: attemptLabel(paper.assessmentSubject, paper.assessmentName, paper.number),
    available: isPaperUploadAvailable(),
    blocked: open ? `${paper.childNickname} has this mock on the iPad. Finish it there, or upload the printed paper of a different mock.` : null,
    pages: pages.map((page, index) => ({
      id: page.id,
      label: `Page ${index + 1}`,
      thumbnailUrl: `/api/upload-pages/${page.id}`,
      isPdf: page.mime === "application/pdf",
      problem: page.problem ? { kind: page.problem as PageProblem, text: problemText(page.problem as PageProblem, `Page ${index + 1}`) } : null,
    })),
    countNote: isPdf ? null : pageCountNote(expectedPages, actualPages),
    expectedPages,
    backHref: `/prepare/${assessmentId}/mocks/${paperId}`,
  };
}

/** One uploaded page, for the parent it belongs to. */
export async function getUploadPageFile(parentProfileId: string, pageId: string, context: Context = {}): Promise<{ body: Uint8Array; contentType: string } | null> {
  const db = context.db ?? (await getReadyDb());
  const page = await getOwnedPage(db, parentProfileId, pageId);
  if (!page || page.bucket !== PRINT_UPLOAD_BUCKET || !isStorageBucket(page.bucket)) return null;
  return (context.storage ?? getStorage()).get({ bucket: page.bucket, key: page.objectKey });
}
