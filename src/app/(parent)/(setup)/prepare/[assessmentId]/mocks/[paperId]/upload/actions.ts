"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { addUploadPage, movePage, removeUploadPage, reorderPages, submitPrintUpload } from "@/application/commands/print-upload";
import { InputError, NotFoundError } from "@/application/errors";
import { getJobService } from "@/application/jobs";
import { requireParent } from "@/application/queries/current-parent";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";
import { isPaperUploadAvailable } from "@/services/ai";

export type PageActionResult = { ok: true } | { ok: false; error: string };

function failure(error: unknown): PageActionResult {
  if (error instanceof NotFoundError) notFound();
  if (error instanceof InputError) return { ok: false, error: Object.values(error.fieldErrors)[0] ?? error.message };
  throw error;
}

/** Adds one photo (or the PDF). The browser sends them one at a time, so a long upload can show its progress. */
export async function addPageAction(paperId: string, formData: FormData): Promise<PageActionResult> {
  const parent = await requireParent();
  if (!isPaperUploadAvailable()) return { ok: false, error: "Uploading a finished paper isn't available right now." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo of the page." };
  const sharpnessRaw = formData.get("sharpness");
  const sharpness = typeof sharpnessRaw === "string" && sharpnessRaw !== "" && Number.isFinite(Number(sharpnessRaw)) ? Number(sharpnessRaw) : null;
  try {
    await addUploadPage(parent.parentProfileId, paperId, { bytes: new Uint8Array(await file.arrayBuffer()), sharpness }, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    return failure(error);
  }
  return { ok: true };
}

export async function removePageAction(paperId: string, pageId: string): Promise<PageActionResult> {
  const parent = await requireParent();
  try {
    await removeUploadPage(parent.parentProfileId, paperId, pageId);
  } catch (error) {
    return failure(error);
  }
  return { ok: true };
}

export async function movePageAction(paperId: string, pageId: string, direction: "earlier" | "later"): Promise<PageActionResult> {
  const parent = await requireParent();
  try {
    await movePage(parent.parentProfileId, paperId, pageId, direction);
  } catch (error) {
    return failure(error);
  }
  return { ok: true };
}

export async function reorderPagesAction(paperId: string, orderedIds: string[]): Promise<PageActionResult> {
  const parent = await requireParent();
  try {
    await reorderPages(parent.parentProfileId, paperId, orderedIds);
  } catch (error) {
    return failure(error);
  }
  return { ok: true };
}

export type SubmitState = { error?: string };

/** "Submit for marking": makes the attempt, starts marking after this answer is sent, and shows where marking is. */
// The form state is only there to carry an error message back, so the earlier state is not read.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function submitUploadAction(paperId: string, _previous: SubmitState): Promise<SubmitState> {
  const parent = await requireParent();
  const jobs = await getJobService();
  let attemptId: string;
  let jobId: string;
  try {
    ({ attemptId, jobId } = await submitPrintUpload(parent.parentProfileId, paperId, jobs, { requestId: (await getRequestId()) ?? null }));
  } catch (error) {
    const result = failure(error);
    return { error: result.ok ? undefined : result.error };
  }
  after(async () => {
    try {
      await jobs.run(jobId);
    } catch (error) {
      logger.error({ err: error, attemptId }, "Marking a paper failed");
    }
  });
  revalidatePath("/", "layout");
  redirect(`/progress/results/${attemptId}`);
}
