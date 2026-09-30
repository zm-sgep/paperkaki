import type { Database } from "@/repositories/postgres/client";
import {
  claimJob,
  failStuckJob,
  finishJob,
  getJob,
  insertJob,
  listQueuedJobsBefore,
  listStuckJobs,
  requeueJob,
} from "@/repositories/postgres/jobs";
import { JobFailure, MAX_ATTEMPTS, STUCK_AFTER_MS, type JobHandler, type JobService } from "./types";

/** In-process job runner over the `jobs` table. `now` is injectable so tests can move the clock. */
export function createJobService(options: { db: Database; now?: () => Date; onError?: (error: unknown) => void }): JobService {
  const { db } = options;
  const now = options.now ?? (() => new Date());
  const handlers = new Map<string, JobHandler>();

  const service: JobService = {
    register(kind, handler) {
      handlers.set(kind, handler);
    },

    enqueue: (kind, payload, within) => insertJob(within ?? db, { kind, payload, createdAt: now() }),

    async run(jobId) {
      const job = await claimJob(db, jobId, now());
      if (!job) return getJob(db, jobId);
      const handler = handlers.get(job.kind);
      let errorCode: string | null = null;
      if (!handler) {
        errorCode = "no_handler";
      } else {
        try {
          await handler(job.payload, { jobId: job.id, attempt: job.attempts });
        } catch (error) {
          errorCode = error instanceof JobFailure ? error.code : "handler_error";
          if (!(error instanceof JobFailure)) options.onError?.(error);
        }
      }
      await finishJob(db, job.id, { status: errorCode ? "failed" : "succeeded", errorCode }, now());
      return getJob(db, job.id);
    },

    async recover() {
      const cutoff = new Date(now().getTime() - STUCK_AFTER_MS);
      let touched = 0;
      for (const job of await listStuckJobs(db, cutoff)) {
        const changed = job.attempts < MAX_ATTEMPTS ? await requeueJob(db, job.id, cutoff) : await failStuckJob(db, job.id, cutoff, now());
        if (changed) touched += 1;
      }
      return touched;
    },

    async runOverdue(olderThanMs = 10_000) {
      const cutoff = new Date(now().getTime() - olderThanMs);
      let ran = 0;
      for (const job of await listQueuedJobsBefore(db, cutoff)) {
        const result = await service.run(job.id);
        if (result && result.status !== "queued") ran += 1;
      }
      return ran;
    },
  };
  return service;
}
