"use server";

import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { saveAttemptProgress, startAttempt, submitAttempt, type SaveResult } from "@/application/commands/attempts";
import { NotFoundError } from "@/application/errors";
import { getJobService } from "@/application/jobs";
import { requireChild } from "@/application/queries/current-child";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
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
  // The AI marker is only asked when a provider is set up; otherwise what rules cannot settle waits for the parent.
  const jobs = env.AI_PROVIDER === "disabled" ? undefined : await getJobService();
  let markingJobId: string | undefined;
  try {
    ({ markingJobId } = await submitAttempt(child, attemptId, { requestId: (await getRequestId()) ?? null, ...(jobs ? { jobs } : {}) }));
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false };
    throw error;
  }
  // Marking runs after the child has been answered, so handing in is never slow.
  if (jobs && markingJobId) {
    const jobId = markingJobId;
    after(async () => {
      try {
        await jobs.run(jobId);
      } catch (error) {
        logger.error({ err: error, attemptId }, "Marking a paper failed");
      }
    });
  }
  return { ok: true };
}
