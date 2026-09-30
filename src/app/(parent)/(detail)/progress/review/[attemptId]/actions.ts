"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { saveMarkingReview } from "@/application/commands/marking-review";
import { InputError, NotFoundError } from "@/application/errors";
import { requireParent } from "@/application/queries/current-parent";
import { getRequestId } from "@/lib/request-context";

export type ReviewState = { error?: string };

/** "Save and next": records the parent's mark for this answer, then shows the next one, or the results when none is left. */
export async function saveReviewAction(attemptId: string, paperQuestionId: string, _previous: ReviewState, formData: FormData): Promise<ReviewState> {
  const parent = await requireParent();
  const raw = formData.get("score");
  if (typeof raw !== "string" || raw === "") return { error: "Choose a mark first." };
  let resultsReady: boolean;
  try {
    ({ resultsReady } = await saveMarkingReview(
      parent.parentProfileId,
      attemptId,
      { paperQuestionId, score: Number(raw) },
      { requestId: (await getRequestId()) ?? null },
    ));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof InputError) return { error: Object.values(error.fieldErrors)[0] ?? error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  // Results when nothing is left; otherwise this page shows the next answer (the revalidation above refreshes it).
  if (resultsReady) redirect(`/progress/results/${attemptId}`);
  return {};
}
