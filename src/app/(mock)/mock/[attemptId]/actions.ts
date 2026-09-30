"use server";

import { notFound, redirect } from "next/navigation";
import { saveAttemptProgress, startAttempt, submitAttempt, type SaveResult } from "@/application/commands/attempts";
import { NotFoundError } from "@/application/errors";
import { requireChild } from "@/application/queries/current-child";
import { getRequestId } from "@/lib/request-context";

/** The child presses Start on the pre-mock screen. The clock starts on the server, once. */
export async function startAttemptAction(attemptId: string): Promise<void> {
  const child = await requireChild();
  try {
    await startAttempt(child, attemptId, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  redirect(`/mock/${attemptId}`);
}

/** Autosave from the child's device: only what changed, safe to send twice. */
export async function saveProgressAction(attemptId: string, input: unknown): Promise<SaveResult> {
  const child = await requireChild();
  try {
    return await saveAttemptProgress(child, attemptId, input, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, reason: "invalid" };
    throw error;
  }
}

/** Hands the paper in. Handing in twice is fine: the second time changes nothing. */
export async function submitAttemptAction(attemptId: string): Promise<{ ok: boolean }> {
  const child = await requireChild();
  try {
    await submitAttempt(child, attemptId, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false };
    throw error;
  }
  return { ok: true };
}
