"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createAssessment } from "@/application/commands/assessments";
import { InputError, NotFoundError } from "@/application/errors";
import { requireParent } from "@/application/queries/current-parent";
import { getRequestId } from "@/lib/request-context";

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
