import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "./client";
import { assessmentSources, type AssessmentSource } from "./schema";

/**
 * Persistence for uploaded school notices (Milestone 5). Reads and changes that a parent makes take
 * the parent's profile id and scope the query by it, so another parent's source simply is not found.
 * The processing job runs as the system and uses the `...ById` functions with an id it was given.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NewAssessmentSource = {
  id: string;
  parentProfileId: string;
  childId: string;
  bucket: string;
  objectKey: string;
  extraFiles: { objectKey: string; mime: string }[];
  mime: string;
  sha256: string;
  byteSize: number;
  pageCount: number;
};

export async function insertAssessmentSource(db: Database, values: NewAssessmentSource): Promise<AssessmentSource> {
  const [row] = await db.insert(assessmentSources).values(values).returning();
  if (!row) throw new Error("Source was not stored.");
  return row;
}

/** One source of this parent whose file has not been deleted. Null for anyone else's, or a bad id. */
export async function getOwnedSource(db: Database, parentProfileId: string, sourceId: string): Promise<AssessmentSource | null> {
  if (!UUID.test(sourceId)) return null;
  const [row] = await db
    .select()
    .from(assessmentSources)
    .where(
      and(
        eq(assessmentSources.id, sourceId),
        eq(assessmentSources.parentProfileId, parentProfileId),
        isNull(assessmentSources.fileDeletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getSourceById(db: Database, sourceId: string): Promise<AssessmentSource | null> {
  if (!UUID.test(sourceId)) return null;
  const [row] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId)).limit(1);
  return row ?? null;
}

type SourceChange = Partial<
  Pick<AssessmentSource, "status" | "failureCode" | "extraction" | "promptVersion" | "assessmentId" | "fileDeletedAt">
>;

export async function updateSource(db: Database, sourceId: string, change: SourceChange): Promise<void> {
  await db.update(assessmentSources).set(change).where(eq(assessmentSources.id, sourceId));
}

/** Marks the file deleted and clears what was read from it. */
export async function markSourceDeleted(db: Database, parentProfileId: string, sourceId: string, now: Date): Promise<AssessmentSource | null> {
  if (!UUID.test(sourceId)) return null;
  const [row] = await db
    .update(assessmentSources)
    .set({ fileDeletedAt: now, extraction: null, failureCode: null })
    .where(
      and(
        eq(assessmentSources.id, sourceId),
        eq(assessmentSources.parentProfileId, parentProfileId),
        isNull(assessmentSources.fileDeletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Starts a failed source over: queued, with no failure. Only if it is the parent's and failed. */
export async function requeueOwnedSource(db: Database, parentProfileId: string, sourceId: string): Promise<AssessmentSource | null> {
  if (!UUID.test(sourceId)) return null;
  const [row] = await db
    .update(assessmentSources)
    .set({ status: "queued", failureCode: null, extraction: null })
    .where(
      and(
        eq(assessmentSources.id, sourceId),
        eq(assessmentSources.parentProfileId, parentProfileId),
        eq(assessmentSources.status, "failed"),
        isNull(assessmentSources.fileDeletedAt),
      ),
    )
    .returning();
  return row ?? null;
}
