"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markMistakesReviewed } from "@/application/commands/marking-review";
import { startPractice } from "@/application/commands/practice";
import { InputError, NotFoundError } from "@/application/errors";
import { requireChild } from "@/application/queries/current-child";

/** "I've fixed my mistakes": the review is recorded once, and Today moves on. */
export async function finishMistakesAction(attemptId: string): Promise<void> {
  const child = await requireChild();
  await markMistakesReviewed({ childId: child.childId }, attemptId);
  revalidatePath("/", "layout");
  redirect("/today");
}

/** "Try one like this": a one-question set on the same skill, from a different family. */
export async function tryOneLikeThisAction(attemptId: string, mistakeNumber: number, formData: FormData): Promise<void> {
  const child = await requireChild();
  const outcomeId = String(formData.get("outcomeId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  let sessionId: string | null = null;
  try {
    sessionId = (await startPractice(child, { kind: "outcome", outcomeId }, { origin: "similar", count: 1, ...(questionId ? { like: questionId } : {}) })).sessionId;
  } catch (error) {
    if (!(error instanceof InputError) && !(error instanceof NotFoundError)) throw error;
  }
  revalidatePath("/", "layout");
  // If there is nothing like it to offer, stay on the mistake.
  redirect(sessionId ? `/practice/session/${sessionId}` : `/results/${attemptId}/mistakes?n=${mistakeNumber}`);
}
