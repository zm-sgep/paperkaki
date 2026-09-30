import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  assessmentBlueprints,
  assessmentRequirements,
  assessmentScopeItems,
  assessments,
  blueprintScopeItems,
  children,
  curriculumDomains,
  curriculumOutcomes,
  curriculumTopics,
  parentProfiles,
  schoolPaperFormats,
  type Assessment,
  type AssessmentRequirements,
  type Child,
} from "./schema";

/**
 * Persistence for children and assessment setup (M3). Every function that reads or changes a
 * child or an assessment takes the parent's profile id and scopes the query by it, so a parent
 * can never reach another parent's rows: no match simply returns nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs and forms may be anything: a malformed one simply matches nothing. */
function isUuid(value: string): boolean {
  return UUID.test(value);
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

export async function listActiveChildren(db: Database, parentProfileId: string): Promise<Child[]> {
  return db
    .select()
    .from(children)
    .where(and(eq(children.parentProfileId, parentProfileId), isNull(children.archivedAt)))
    .orderBy(asc(children.createdAt), asc(children.id));
}

export async function getOwnedChild(db: Database, parentProfileId: string, childId: string): Promise<Child | null> {
  if (!isUuid(childId)) return null;
  const [row] = await db
    .select()
    .from(children)
    .where(and(eq(children.id, childId), eq(children.parentProfileId, parentProfileId)))
    .limit(1);
  return row ?? null;
}

export async function insertChild(
  db: Database,
  values: { parentProfileId: string; nickname: string; level: Child["level"]; schoolName: string | null; academicYear: number },
): Promise<Child> {
  const [row] = await db.insert(children).values(values).returning();
  if (!row) throw new Error("Child was not stored.");
  return row;
}

export async function updateOwnedChild(
  db: Database,
  parentProfileId: string,
  childId: string,
  values: { nickname: string; schoolName: string | null },
): Promise<Child | null> {
  if (!isUuid(childId)) return null;
  const [row] = await db
    .update(children)
    .set(values)
    .where(and(eq(children.id, childId), eq(children.parentProfileId, parentProfileId), isNull(children.archivedAt)))
    .returning();
  return row ?? null;
}

export async function archiveOwnedChild(
  db: Database,
  parentProfileId: string,
  childId: string,
  now: Date,
): Promise<Child | null> {
  if (!isUuid(childId)) return null;
  const [row] = await db
    .update(children)
    .set({ archivedAt: now })
    .where(and(eq(children.id, childId), eq(children.parentProfileId, parentProfileId), isNull(children.archivedAt)))
    .returning();
  return row ?? null;
}

export async function getLastSelectedChildId(db: Database, parentProfileId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: parentProfiles.lastSelectedChildId })
    .from(parentProfiles)
    .where(eq(parentProfiles.id, parentProfileId))
    .limit(1);
  return row?.id ?? null;
}

export async function setLastSelectedChildId(db: Database, parentProfileId: string, childId: string | null): Promise<void> {
  await db.update(parentProfiles).set({ lastSelectedChildId: childId }).where(eq(parentProfiles.id, parentProfileId));
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export type OwnedAssessment = Assessment & { childNickname: string; childArchived: boolean; parentProfileId: string };

/** One assessment, only if its child belongs to this parent. */
export async function getOwnedAssessment(
  db: Database,
  parentProfileId: string,
  assessmentId: string,
): Promise<OwnedAssessment | null> {
  if (!isUuid(assessmentId)) return null;
  const [row] = await db
    .select({ assessment: assessments, nickname: children.nickname, archivedAt: children.archivedAt })
    .from(assessments)
    .innerJoin(children, eq(children.id, assessments.childId))
    .where(and(eq(assessments.id, assessmentId), eq(children.parentProfileId, parentProfileId)))
    .limit(1);
  return row
    ? { ...row.assessment, childNickname: row.nickname, childArchived: row.archivedAt !== null, parentProfileId }
    : null;
}

/** Assessments of this parent's active children, oldest created first (ties on date keep this order). */
export async function listAssessmentsForParent(
  db: Database,
  parentProfileId: string,
  childId?: string,
): Promise<OwnedAssessment[]> {
  const rows = await db
    .select({ assessment: assessments, nickname: children.nickname })
    .from(assessments)
    .innerJoin(children, eq(children.id, assessments.childId))
    .where(
      and(
        eq(children.parentProfileId, parentProfileId),
        isNull(children.archivedAt),
        childId ? eq(assessments.childId, childId) : undefined,
      ),
    )
    .orderBy(asc(assessments.createdAt), asc(assessments.id));
  return rows.map((row) => ({ ...row.assessment, childNickname: row.nickname, childArchived: false, parentProfileId }));
}

export async function insertAssessment(
  db: Database,
  values: {
    childId: string;
    curriculumVersionId: string;
    subject: string;
    level: string;
    assessmentType: Assessment["assessmentType"];
    name: string;
    date: string;
  },
): Promise<Assessment> {
  const [row] = await db.insert(assessments).values(values).returning();
  if (!row) throw new Error("Assessment was not stored.");
  return row;
}

export async function setAssessmentStatus(
  db: Database,
  assessmentId: string,
  status: "draft" | "scope_confirmed",
  now: Date,
): Promise<void> {
  await db
    .update(assessments)
    .set({ status, scopeConfirmedAt: status === "scope_confirmed" ? now : null })
    .where(eq(assessments.id, assessmentId));
}

// ---------------------------------------------------------------------------
// Curriculum lookups scoped to one version
// ---------------------------------------------------------------------------

export type VersionTopic = { topicId: string; code: string; label: string; outcomeIds: string[] };

/** Topics of one curriculum version and level in curriculum order, each with its outcome ids in order. */
export async function listTopicsInVersion(
  db: Database,
  curriculumVersionId: string,
  level: string,
): Promise<VersionTopic[]> {
  const rows = await db
    .select({
      topicId: curriculumTopics.id,
      code: curriculumTopics.code,
      label: curriculumTopics.parentLabel,
      outcomeId: curriculumOutcomes.id,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumDomains, eq(curriculumDomains.id, curriculumTopics.domainId))
    .innerJoin(curriculumOutcomes, eq(curriculumOutcomes.topicId, curriculumTopics.id))
    .where(
      and(
        eq(curriculumTopics.curriculumVersionId, curriculumVersionId),
        eq(curriculumTopics.level, level),
        eq(curriculumOutcomes.curriculumVersionId, curriculumVersionId),
      ),
    )
    .orderBy(
      asc(curriculumDomains.sortOrder),
      asc(curriculumTopics.sortOrder),
      asc(curriculumTopics.code),
      asc(curriculumOutcomes.sortOrder),
      asc(curriculumOutcomes.code),
    );
  const byTopic = new Map<string, VersionTopic>();
  for (const row of rows) {
    const topic = byTopic.get(row.topicId) ?? { topicId: row.topicId, code: row.code, label: row.label, outcomeIds: [] };
    topic.outcomeIds.push(row.outcomeId);
    byTopic.set(row.topicId, topic);
  }
  return [...byTopic.values()];
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

export async function listScopeItems(db: Database, assessmentId: string): Promise<{ topicId: string; outcomeId: string }[]> {
  return db
    .select({ topicId: assessmentScopeItems.topicId, outcomeId: assessmentScopeItems.outcomeId })
    .from(assessmentScopeItems)
    .where(eq(assessmentScopeItems.assessmentId, assessmentId))
    .orderBy(asc(assessmentScopeItems.outcomeId));
}

export async function replaceScopeItems(
  db: Database,
  assessmentId: string,
  items: { topicId: string; outcomeId: string }[],
): Promise<void> {
  await db.delete(assessmentScopeItems).where(eq(assessmentScopeItems.assessmentId, assessmentId));
  if (items.length > 0) {
    await db.insert(assessmentScopeItems).values(items.map((item) => ({ assessmentId, ...item })));
  }
}

// ---------------------------------------------------------------------------
// Requirements (paper settings, stored apart from scope)
// ---------------------------------------------------------------------------

export async function getRequirements(db: Database, assessmentId: string): Promise<AssessmentRequirements | null> {
  const [row] = await db
    .select()
    .from(assessmentRequirements)
    .where(eq(assessmentRequirements.assessmentId, assessmentId))
    .limit(1);
  return row ?? null;
}

export async function upsertRequirements(
  db: Database,
  assessmentId: string,
  values: {
    totalMarks: number;
    durationMinutes: number;
    difficulty: AssessmentRequirements["difficulty"];
    source: AssessmentRequirements["source"];
    /** The chosen paper format as JSON, or null for the standard mock. */
    paperFormat: Record<string, unknown> | null;
  },
): Promise<void> {
  await db
    .insert(assessmentRequirements)
    .values({ assessmentId, ...values })
    .onConflictDoUpdate({ target: assessmentRequirements.assessmentId, set: { ...values, updatedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// School paper formats (saved per child and assessment type)
// ---------------------------------------------------------------------------

/** The format saved for one of this parent's children, or null. Another parent's child matches nothing. */
export async function getSchoolPaperFormat(
  db: Database,
  parentProfileId: string,
  childId: string,
  assessmentType: Assessment["assessmentType"],
): Promise<Record<string, unknown> | null> {
  if (!isUuid(childId)) return null;
  const [row] = await db
    .select({ format: schoolPaperFormats.format })
    .from(schoolPaperFormats)
    .innerJoin(children, eq(children.id, schoolPaperFormats.childId))
    .where(
      and(
        eq(schoolPaperFormats.childId, childId),
        eq(schoolPaperFormats.assessmentType, assessmentType),
        eq(children.parentProfileId, parentProfileId),
      ),
    )
    .limit(1);
  return row?.format ?? null;
}

/** Saves (or replaces) the format for this parent's child. Returns false when the child is not theirs. */
export async function upsertSchoolPaperFormat(
  db: Database,
  parentProfileId: string,
  childId: string,
  assessmentType: Assessment["assessmentType"],
  format: Record<string, unknown>,
): Promise<boolean> {
  const child = await getOwnedChild(db, parentProfileId, childId);
  if (!child) return false;
  await db
    .insert(schoolPaperFormats)
    .values({ childId, assessmentType, format })
    .onConflictDoUpdate({
      target: [schoolPaperFormats.childId, schoolPaperFormats.assessmentType],
      set: { format, updatedAt: new Date() },
    });
  return true;
}

// ---------------------------------------------------------------------------
// Blueprints (versioned)
// ---------------------------------------------------------------------------

export async function getLatestBlueprint(
  db: Database,
  assessmentId: string,
): Promise<{ id: string; version: number; spec: Record<string, unknown> } | null> {
  const [row] = await db
    .select({ id: assessmentBlueprints.id, version: assessmentBlueprints.version, spec: assessmentBlueprints.spec })
    .from(assessmentBlueprints)
    .where(eq(assessmentBlueprints.assessmentId, assessmentId))
    .orderBy(desc(assessmentBlueprints.version))
    .limit(1);
  return row ?? null;
}

export async function insertBlueprintVersion(
  db: Database,
  input: {
    assessmentId: string;
    version: number;
    spec: Record<string, unknown>;
    scope: { topicId: string; targetMarks: number }[];
  },
): Promise<string> {
  const [row] = await db
    .insert(assessmentBlueprints)
    .values({ assessmentId: input.assessmentId, version: input.version, spec: input.spec })
    .returning({ id: assessmentBlueprints.id });
  if (!row) throw new Error("Blueprint was not stored.");
  if (input.scope.length > 0) {
    await db.insert(blueprintScopeItems).values(input.scope.map((item) => ({ blueprintId: row.id, ...item })));
  }
  return row.id;
}

export async function countBlueprints(db: Database, assessmentId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(assessmentBlueprints)
    .where(eq(assessmentBlueprints.assessmentId, assessmentId));
  return row?.n ?? 0;
}

export async function listBlueprintScopeTopicIds(db: Database, blueprintId: string): Promise<string[]> {
  const rows = await db
    .select({ topicId: blueprintScopeItems.topicId })
    .from(blueprintScopeItems)
    .where(eq(blueprintScopeItems.blueprintId, blueprintId));
  return rows.map((r) => r.topicId);
}

