"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { startPractice, startRecommendedPractice, type PracticeOrigin } from "@/application/commands/practice";
import { InputError, NotFoundError } from "@/application/errors";
import { requireChild } from "@/application/queries/current-child";

/** Where a start that could not begin sends the child: back to Practice, calmly. */
function backToPractice(): never {
  redirect("/practice");
}

function sessionUrl(sessionId: string): string {
  return `/practice/session/${sessionId}`;
}

/** "Start" on Today or on the recommended card: what is recommended (a parent's suggestion first), in one tap. */
export async function startRecommendedAction(): Promise<void> {
  const child = await requireChild();
  let sessionId: string;
  try {
    sessionId = (await startRecommendedPractice(child)).sessionId;
  } catch (error) {
    if (error instanceof InputError || error instanceof NotFoundError) backToPractice();
    throw error;
  }
  revalidatePath("/", "layout");
  redirect(sessionUrl(sessionId));
}

/** A topic or skill picked from a card. Tapping a card is the only way to start one, so there is one form per card. */
export async function startChosenAction(formData: FormData): Promise<void> {
  const child = await requireChild();
  const topicId = String(formData.get("topicId") ?? "");
  const outcomeId = String(formData.get("outcomeId") ?? "");
  const origin: PracticeOrigin = formData.get("origin") === "similar" ? "similar" : "chosen";
  let sessionId: string;
  try {
    sessionId = (
      await startPractice(child, outcomeId ? { kind: "outcome", outcomeId } : { kind: "topic", topicId }, { origin })
    ).sessionId;
  } catch (error) {
    if (error instanceof InputError || error instanceof NotFoundError) backToPractice();
    throw error;
  }
  revalidatePath("/", "layout");
  redirect(sessionUrl(sessionId));
}
