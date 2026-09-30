"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addSimilarQuestion, answerPracticeQuestion, finishPractice, type PracticeFeedback } from "@/application/commands/practice";
import { InputError, NotFoundError } from "@/application/errors";
import { requireChild } from "@/application/queries/current-child";

export type CheckResult = { ok: true; feedback: PracticeFeedback } | { ok: false; error: string };
export type SimilarResult = { ok: true } | { ok: false; error: string };

function messageOf(error: unknown): string | null {
  if (error instanceof InputError) return Object.values(error.fieldErrors)[0] ?? error.message;
  if (error instanceof NotFoundError) return "We can't find that question.";
  return null;
}

/** "Check answer": marks it by rule and returns the feedback to show. */
export async function checkAnswerAction(sessionId: string, position: number, input: { selected: string | null; typed: string | null }): Promise<CheckResult> {
  const child = await requireChild();
  try {
    return { ok: true, feedback: await answerPracticeQuestion(child, sessionId, position, input) };
  } catch (error) {
    const message = messageOf(error);
    if (message) return { ok: false, error: message };
    throw error;
  }
}

/** "Try one like this": adds a question right after this one. */
export async function similarAction(sessionId: string, position: number): Promise<SimilarResult> {
  const child = await requireChild();
  try {
    await addSimilarQuestion(child, sessionId, position);
    return { ok: true };
  } catch (error) {
    const message = messageOf(error);
    if (message) return { ok: false, error: message };
    throw error;
  }
}

/** "Finish": closes the set and shows the calm end screen (the same address, now finished). */
export async function finishAction(sessionId: string): Promise<void> {
  const child = await requireChild();
  try {
    await finishPractice(child, sessionId);
  } catch (error) {
    if (!(error instanceof InputError) && !(error instanceof NotFoundError)) throw error;
  }
  revalidatePath("/", "layout");
  redirect(`/practice/session/${sessionId}`);
}
