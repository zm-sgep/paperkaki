"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { createAssessment } from "@/application/commands/assessments";
import { uploadNotice } from "@/application/commands/notice-sources";
import { InputError, NotFoundError } from "@/application/errors";
import { getJobService } from "@/application/jobs";
import { requireParent } from "@/application/queries/current-parent";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";
import { isNoticeUploadAvailable } from "@/services/ai";

export type NewAssessmentState = {
  errors?: Record<string, string>;
  values?: { childId?: string; nickname?: string; type?: string; customName?: string; date?: string };
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Creates the assessment (and the first child, if there is none yet), then goes to choosing topics. */
export async function createAssessmentAction(_previous: NewAssessmentState, formData: FormData): Promise<NewAssessmentState> {
  const parent = await requireParent();
  const values = {
    childId: text(formData, "childId"),
    nickname: text(formData, "nickname"),
    type: text(formData, "type"),
    customName: text(formData, "customName"),
    date: text(formData, "date"),
  };

  let assessmentId: string;
  try {
    const assessment = await createAssessment(
      parent.parentProfileId,
      {
        childId: values.childId || undefined,
        newChildNickname: values.childId ? undefined : values.nickname,
        type: values.type,
        customName: values.customName,
        date: values.date,
      },
      { requestId: (await getRequestId()) ?? null },
    );
    assessmentId = assessment.id;
  } catch (error) {
    if (error instanceof InputError) return { errors: error.fieldErrors, values };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  redirect(`/prepare/${assessmentId}/scope`);
}

export type UploadNoticeState = { errors?: Record<string, string>; values?: { nickname?: string } };

/**
 * Stores the chosen notice privately and goes to the "reading" screen. The reading itself runs
 * after this response has been sent (`after`), so the parent is never made to wait on it.
 */
export async function uploadNoticeAction(_previous: UploadNoticeState, formData: FormData): Promise<UploadNoticeState> {
  const parent = await requireParent();
  const values = { nickname: text(formData, "nickname") };
  if (!isNoticeUploadAvailable()) {
    return { errors: { form: "Uploading a notice isn't available right now. Please enter the details yourself." }, values };
  }
  const chosen = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const files = await Promise.all(chosen.map(async (file) => ({ bytes: new Uint8Array(await file.arrayBuffer()) })));

  const jobs = await getJobService();
  let sourceId: string;
  let jobId: string;
  try {
    const childId = text(formData, "childId");
    ({ sourceId, jobId } = await uploadNotice(
      parent.parentProfileId,
      { childId: childId || undefined, newChildNickname: childId ? undefined : values.nickname, files },
      jobs,
      { requestId: (await getRequestId()) ?? null },
    ));
  } catch (error) {
    if (error instanceof InputError) return { errors: error.fieldErrors, values };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  after(async () => {
    try {
      await jobs.run(jobId);
    } catch (error) {
      logger.error({ err: error, sourceId }, "Reading a school notice failed");
    }
  });
  revalidatePath("/", "layout");
  redirect(`/prepare/new/notice/${sourceId}`);
}
