"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { confirmNotice, deleteNoticeFile, retryNotice } from "@/application/commands/notice-sources";
import { InputError, NotFoundError } from "@/application/errors";
import { getJobService } from "@/application/jobs";
import { requireParent } from "@/application/queries/current-parent";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";

export type ConfirmNoticeState = { errors?: Record<string, string> };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** "Looks right": makes the assessment from the notice and goes to "Your mock is ready to create". */
export async function confirmNoticeAction(sourceId: string, _previous: ConfirmNoticeState, formData: FormData): Promise<ConfirmNoticeState> {
  const parent = await requireParent();
  let format: unknown;
  const rawFormat = text(formData, "format");
  if (rawFormat !== "") {
    try {
      format = JSON.parse(rawFormat);
    } catch {
      return { errors: { format: "Check the parts of the paper and try again." } };
    }
  }

  let assessmentId: string;
  try {
    ({ assessmentId } = await confirmNotice(
      parent.parentProfileId,
      sourceId,
      {
        type: text(formData, "type"),
        customName: text(formData, "customName"),
        date: text(formData, "date"),
        durationMinutes: text(formData, "durationMinutes"),
        topicCodes: formData.getAll("topic").filter((value): value is string => typeof value === "string"),
        format,
        saveForFuture: text(formData, "saveForFuture") !== "false",
      },
      { requestId: (await getRequestId()) ?? null },
    ));
  } catch (error) {
    if (error instanceof InputError) return { errors: error.fieldErrors };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  redirect(`/prepare/${assessmentId}`);
}

/** "Try again": the same saved file, read once more. */
export async function retryNoticeAction(sourceId: string): Promise<void> {
  const parent = await requireParent();
  const jobs = await getJobService();
  let jobId: string;
  try {
    ({ jobId } = await retryNotice(parent.parentProfileId, sourceId, jobs, { requestId: (await getRequestId()) ?? null }));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof InputError) redirect("/prepare/new");
    throw error;
  }
  after(async () => {
    try {
      await jobs.run(jobId);
    } catch (error) {
      logger.error({ err: error, sourceId }, "Reading a school notice failed");
    }
  });
  revalidatePath(`/prepare/new/notice/${sourceId}`);
  redirect(`/prepare/new/notice/${sourceId}`);
}

/** "Delete this file": removes the stored notice and what was read from it. */
export async function deleteNoticeAction(sourceId: string): Promise<void> {
  const parent = await requireParent();
  try {
    await deleteNoticeFile(parent.parentProfileId, sourceId, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  redirect("/prepare/new");
}
