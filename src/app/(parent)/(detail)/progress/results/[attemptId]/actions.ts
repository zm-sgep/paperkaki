"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { retryMarking } from "@/application/commands/marking-review";
import { NotFoundError } from "@/application/errors";
import { getJobService } from "@/application/jobs";
import { requireParent } from "@/application/queries/current-parent";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";

/** "Try again" after a photographed paper could not be read: the pages are safe, so only reading starts over. */
export async function retryMarkingAction(attemptId: string): Promise<void> {
  const parent = await requireParent();
  const jobs = await getJobService();
  let jobId: string | null;
  try {
    jobId = await retryMarking(parent.parentProfileId, attemptId, jobs, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  if (jobId) {
    const id = jobId;
    after(async () => {
      try {
        await jobs.run(id);
      } catch (error) {
        logger.error({ err: error, attemptId }, "Marking a paper failed");
      }
    });
  }
  revalidatePath("/", "layout");
}
