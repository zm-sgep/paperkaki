"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { confirmScope, setAssessmentScope } from "@/application/commands/assessments";
import { InputError, NotFoundError } from "@/application/errors";
import { requireParent } from "@/application/queries/current-parent";
import { getRequestId } from "@/lib/request-context";

export type ScopeState = { error?: string };

/** Saves the ticked topics and confirms them, then shows the mock summary. */
export async function confirmTopicsAction(assessmentId: string, _previous: ScopeState, formData: FormData): Promise<ScopeState> {
  const parent = await requireParent();
  const topicIds = formData.getAll("topic").filter((value): value is string => typeof value === "string");
  const context = { requestId: (await getRequestId()) ?? null };
  try {
    await setAssessmentScope(parent.parentProfileId, assessmentId, topicIds, context);
    await confirmScope(parent.parentProfileId, assessmentId, context);
  } catch (error) {
    if (error instanceof InputError) return { error: error.fieldErrors.topics ?? error.message };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  redirect(`/prepare/${assessmentId}`);
}
