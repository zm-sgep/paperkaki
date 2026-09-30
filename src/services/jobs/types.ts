import type { Database } from "@/repositories/postgres/client";
import type { Job } from "@/repositories/postgres/schema";

/**
 * Durable background jobs (docs/ARCHITECTURE.md section 15): queued -> running -> succeeded | failed.
 * Jobs run in this process. The job row is what survives a restart, so a job left `running` for
 * more than two minutes is tried once more, and one nobody started is picked up when its status is read.
 */

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type JobContext = { jobId: string; attempt: number };

/** Throw this from a handler for a failure the caller knows by name; anything else becomes "handler_error". */
export class JobFailure extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "JobFailure";
    this.code = code;
  }
}

export type JobHandler = (payload: Record<string, unknown>, context: JobContext) => Promise<void>;

export interface JobService {
  register(kind: string, handler: JobHandler): void;
  /**
   * Stores a queued job. Nothing runs until `run` is called with its id. Pass `within` to store it
   * in the caller's transaction, so the job exists exactly when the thing it is about does.
   */
  enqueue(kind: string, payload: Record<string, unknown>, within?: Database): Promise<Job>;
  /** Takes the job if it is still queued and runs it to the end. A job someone else took is left alone. */
  run(jobId: string): Promise<Job | null>;
  /** Stuck `running` jobs go back to the queue (once) or fail. Returns how many were touched. */
  recover(): Promise<number>;
  /** Runs queued jobs that have waited longer than `olderThanMs` with nobody starting them. */
  runOverdue(olderThanMs?: number): Promise<number>;
}

/** A job that has been running for longer than this is presumed lost. */
export const STUCK_AFTER_MS = 2 * 60 * 1000;
/** A job may be tried this many times in all (the first run plus one retry). */
export const MAX_ATTEMPTS = 2;
