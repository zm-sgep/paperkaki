import { logger } from "@/lib/logger";
import { getReadyDb } from "@/repositories/postgres/ready";
import { createJobService, type JobService } from "@/services/jobs";
import { NOTICE_EXTRACTION_JOB, processNoticeSource } from "./notice-processing";

const globalForJobs = globalThis as unknown as { __paperkakiJobs?: Promise<JobService> };

/** The job runner for this process, with every job kind registered. */
export function getJobService(): Promise<JobService> {
  globalForJobs.__paperkakiJobs ??= (async () => {
    const db = await getReadyDb();
    const jobs = createJobService({ db, onError: (error) => logger.error({ err: error }, "A background job failed") });
    jobs.register(NOTICE_EXTRACTION_JOB, async (payload) => {
      const sourceId = payload.sourceId;
      if (typeof sourceId !== "string") return;
      await processNoticeSource(sourceId, { db });
    });
    return jobs;
  })();
  return globalForJobs.__paperkakiJobs;
}
