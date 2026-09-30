import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import { jobs, type Job } from "./schema";

export async function insertJob(db: Database, values: { kind: string; payload: Record<string, unknown>; createdAt?: Date }): Promise<Job> {
  const [row] = await db.insert(jobs).values(values).returning();
  if (!row) throw new Error("Job was not stored.");
  return row;
}

export async function getJob(db: Database, jobId: string): Promise<Job | null> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return row ?? null;
}

/** queued -> running in one statement, so two runners can never both take the same job. */
export async function claimJob(db: Database, jobId: string, now: Date): Promise<Job | null> {
  const [row] = await db
    .update(jobs)
    .set({ status: "running", attempts: sql`${jobs.attempts} + 1`, startedAt: now, errorCode: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "queued")))
    .returning();
  return row ?? null;
}

export async function finishJob(db: Database, jobId: string, result: { status: "succeeded" | "failed"; errorCode: string | null }, now: Date): Promise<void> {
  await db.update(jobs).set({ status: result.status, errorCode: result.errorCode, finishedAt: now }).where(eq(jobs.id, jobId));
}

/** Jobs left `running` since before `cutoff`: the process that took them is gone. */
export async function listStuckJobs(db: Database, cutoff: Date): Promise<Job[]> {
  return db.select().from(jobs).where(and(eq(jobs.status, "running"), lt(jobs.startedAt, cutoff))).orderBy(asc(jobs.createdAt));
}

/** Puts a stuck job back in the queue, only if it is still the same stuck run. */
export async function requeueJob(db: Database, jobId: string, cutoff: Date): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: "queued", startedAt: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "running"), lt(jobs.startedAt, cutoff)))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

export async function failStuckJob(db: Database, jobId: string, cutoff: Date, now: Date): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: "failed", errorCode: "stuck", finishedAt: now })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "running"), lt(jobs.startedAt, cutoff)))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/** Queued jobs nobody has started, oldest first (the process that queued them may have restarted). */
export async function listQueuedJobsBefore(db: Database, cutoff: Date, kind?: string): Promise<Job[]> {
  const where = kind
    ? and(eq(jobs.status, "queued"), lt(jobs.createdAt, cutoff), eq(jobs.kind, kind))
    : and(eq(jobs.status, "queued"), lt(jobs.createdAt, cutoff));
  return db.select().from(jobs).where(where).orderBy(asc(jobs.createdAt));
}
