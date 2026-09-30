import type { Database } from "./client";
import { aiRuns, type AiRun } from "./schema";

export type NewAiRun = {
  task: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: "succeeded" | "failed";
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
};

export async function insertAiRun(db: Database, run: NewAiRun): Promise<AiRun> {
  const [row] = await db.insert(aiRuns).values(run).returning();
  if (!row) throw new Error("AI run was not stored.");
  return row;
}
