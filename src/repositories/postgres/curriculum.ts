import { and, arrayContains, asc, count, desc, eq, sql } from "drizzle-orm";
import {
  assembleCurriculumTree,
  type CurriculumAudience,
  type CurriculumTree,
  type CurriculumVersionSummary,
  type OutcomeDetail,
  type OutcomeNode,
  type OutcomeSourceLink,
  type PublishCandidateOutcome,
  type VersionStatus,
} from "@/domain/curriculum";
import type { Database } from "./client";
import {
  curriculumDomains,
  curriculumOutcomeSources,
  curriculumOutcomes,
  curriculumTopics,
  curriculumVersions,
  sourceDocuments,
  subjects,
} from "./schema";

/**
 * Curriculum reads. Every function below the version lookups takes a curriculum version id and
 * filters by it, so a topic or outcome id from another version can never leak into a result
 * (docs/DATA_MODEL.md section 14: never silently remap to a newer version).
 */

const versionColumns = {
  id: curriculumVersions.id,
  code: curriculumVersions.code,
  subject: subjects.name,
  title: curriculumVersions.title,
  levels: curriculumVersions.levels,
  status: curriculumVersions.status,
  effectiveFrom: curriculumVersions.effectiveFrom,
  publishedAt: curriculumVersions.publishedAt,
};

/** Newest first: latest effective date, then latest publication, then latest creation. */
const newestFirst = [
  sql`${curriculumVersions.effectiveFrom} desc nulls last`,
  sql`${curriculumVersions.publishedAt} desc nulls last`,
  desc(curriculumVersions.createdAt),
];

export async function getVersion(db: Database, versionId: string): Promise<CurriculumVersionSummary | null> {
  const [row] = await db
    .select(versionColumns)
    .from(curriculumVersions)
    .innerJoin(subjects, eq(subjects.id, curriculumVersions.subjectId))
    .where(eq(curriculumVersions.id, versionId))
    .limit(1);
  return row ?? null;
}

export async function findVersionByCode(db: Database, code: string): Promise<CurriculumVersionSummary | null> {
  const [row] = await db
    .select(versionColumns)
    .from(curriculumVersions)
    .innerJoin(subjects, eq(subjects.id, curriculumVersions.subjectId))
    .where(eq(curriculumVersions.code, code))
    .limit(1);
  return row ?? null;
}

/** All versions, newest first. Admin use. */
export async function listVersions(db: Database): Promise<CurriculumVersionSummary[]> {
  return db
    .select(versionColumns)
    .from(curriculumVersions)
    .innerJoin(subjects, eq(subjects.id, curriculumVersions.subjectId))
    .orderBy(...newestFirst);
}

/**
 * The newest version of a subject that covers a level. Only published versions unless the
 * audience is "admin" (drafts and retired versions are for the admin area alone).
 */
export async function findVersionForSubjectLevel(
  db: Database,
  input: { subject: string; level: string; audience: CurriculumAudience },
): Promise<CurriculumVersionSummary | null> {
  const conditions = [eq(subjects.name, input.subject), arrayContains(curriculumVersions.levels, [input.level])];
  if (input.audience !== "admin") {
    conditions.push(eq(curriculumVersions.status, "published"));
  }
  const [row] = await db
    .select(versionColumns)
    .from(curriculumVersions)
    .innerJoin(subjects, eq(subjects.id, curriculumVersions.subjectId))
    .where(and(...conditions))
    .orderBy(...newestFirst)
    .limit(1);
  return row ?? null;
}

const topicColumns = {
  id: curriculumTopics.id,
  code: curriculumTopics.code,
  title: curriculumTopics.title,
  parentLabel: curriculumTopics.parentLabel,
  level: curriculumTopics.level,
  sortOrder: curriculumTopics.sortOrder,
  scopeNotes: curriculumTopics.scopeNotes,
  domainId: curriculumTopics.domainId,
};

const outcomeColumns = {
  id: curriculumOutcomes.id,
  code: curriculumOutcomes.code,
  statement: curriculumOutcomes.statement,
  childLabel: curriculumOutcomes.childLabel,
  level: curriculumOutcomes.level,
  sortOrder: curriculumOutcomes.sortOrder,
  verification: curriculumOutcomes.verification,
  topicId: curriculumOutcomes.topicId,
};

/** Domains -> topics -> outcomes of one version, optionally narrowed to a level and/or one topic. */
export async function getCurriculumTree(
  db: Database,
  versionId: string,
  filter: { level?: string; topicId?: string } = {},
): Promise<CurriculumTree | null> {
  const version = await getVersion(db, versionId);
  if (!version) {
    return null;
  }

  const topicConditions = [eq(curriculumTopics.curriculumVersionId, versionId)];
  const outcomeConditions = [eq(curriculumOutcomes.curriculumVersionId, versionId)];
  if (filter.level) {
    topicConditions.push(eq(curriculumTopics.level, filter.level));
    outcomeConditions.push(eq(curriculumOutcomes.level, filter.level));
  }
  if (filter.topicId) {
    topicConditions.push(eq(curriculumTopics.id, filter.topicId));
    outcomeConditions.push(eq(curriculumOutcomes.topicId, filter.topicId));
  }

  const [domains, topics, outcomes] = await Promise.all([
    db
      .select({
        id: curriculumDomains.id,
        code: curriculumDomains.code,
        title: curriculumDomains.title,
        sortOrder: curriculumDomains.sortOrder,
      })
      .from(curriculumDomains)
      .where(eq(curriculumDomains.curriculumVersionId, versionId)),
    db.select(topicColumns).from(curriculumTopics).where(and(...topicConditions)),
    db.select(outcomeColumns).from(curriculumOutcomes).where(and(...outcomeConditions)),
  ]);

  return assembleCurriculumTree(version, domains, topics, outcomes);
}

/** Outcomes of one topic, in curriculum order. The topic must belong to the given version. */
export async function listOutcomesByTopic(db: Database, versionId: string, topicId: string): Promise<OutcomeNode[]> {
  const rows = await db
    .select(outcomeColumns)
    .from(curriculumOutcomes)
    .where(and(eq(curriculumOutcomes.curriculumVersionId, versionId), eq(curriculumOutcomes.topicId, topicId)))
    .orderBy(asc(curriculumOutcomes.sortOrder), asc(curriculumOutcomes.code));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    statement: row.statement,
    childLabel: row.childLabel,
    level: row.level,
    sortOrder: row.sortOrder,
    verification: row.verification,
  }));
}

export async function getOutcomeSources(db: Database, outcomeId: string): Promise<OutcomeSourceLink[]> {
  return db
    .select({
      linkId: curriculumOutcomeSources.id,
      sourceId: sourceDocuments.id,
      sourceCode: sourceDocuments.code,
      title: sourceDocuments.title,
      publisher: sourceDocuments.publisher,
      url: sourceDocuments.url,
      provenance: sourceDocuments.provenance,
      sourceVerification: sourceDocuments.verification,
      pageOrSection: curriculumOutcomeSources.pageOrSection,
    })
    .from(curriculumOutcomeSources)
    .innerJoin(sourceDocuments, eq(sourceDocuments.id, curriculumOutcomeSources.sourceId))
    .where(eq(curriculumOutcomeSources.outcomeId, outcomeId))
    .orderBy(asc(sourceDocuments.title), asc(curriculumOutcomeSources.pageOrSection));
}

/** One outcome with its sources. Null when the outcome is not in the given version. */
export async function getOutcomeDetail(
  db: Database,
  versionId: string,
  outcomeId: string,
): Promise<OutcomeDetail | null> {
  const [row] = await db
    .select({
      ...outcomeColumns,
      curriculumVersionId: curriculumOutcomes.curriculumVersionId,
      topicCode: curriculumTopics.code,
      topicTitle: curriculumTopics.title,
      verifiedBy: curriculumOutcomes.verifiedBy,
      verifiedAt: curriculumOutcomes.verifiedAt,
    })
    .from(curriculumOutcomes)
    .innerJoin(curriculumTopics, eq(curriculumTopics.id, curriculumOutcomes.topicId))
    .where(and(eq(curriculumOutcomes.curriculumVersionId, versionId), eq(curriculumOutcomes.id, outcomeId)))
    .limit(1);
  if (!row) {
    return null;
  }
  return { ...row, sources: await getOutcomeSources(db, outcomeId) };
}

/** Per outcome: how many source links and its verification. Input to the publish rules. */
export async function listPublishCandidates(db: Database, versionId: string): Promise<PublishCandidateOutcome[]> {
  const rows = await db
    .select({
      code: curriculumOutcomes.code,
      verification: curriculumOutcomes.verification,
      sourceLinkCount: count(curriculumOutcomeSources.id),
    })
    .from(curriculumOutcomes)
    .leftJoin(curriculumOutcomeSources, eq(curriculumOutcomeSources.outcomeId, curriculumOutcomes.id))
    .where(eq(curriculumOutcomes.curriculumVersionId, versionId))
    .groupBy(curriculumOutcomes.id, curriculumOutcomes.code, curriculumOutcomes.verification)
    .orderBy(asc(curriculumOutcomes.code));
  return rows;
}

export type VersionCounts = { domains: number; topics: number; outcomes: number; unverifiedOutcomes: number };

export async function countVersionContents(db: Database, versionId: string): Promise<VersionCounts> {
  const [domains] = await db
    .select({ n: count() })
    .from(curriculumDomains)
    .where(eq(curriculumDomains.curriculumVersionId, versionId));
  const [topics] = await db
    .select({ n: count() })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.curriculumVersionId, versionId));
  const [outcomes] = await db
    .select({ n: count() })
    .from(curriculumOutcomes)
    .where(eq(curriculumOutcomes.curriculumVersionId, versionId));
  const [unverified] = await db
    .select({ n: count() })
    .from(curriculumOutcomes)
    .where(and(eq(curriculumOutcomes.curriculumVersionId, versionId), eq(curriculumOutcomes.verification, "unverified")));
  return {
    domains: domains?.n ?? 0,
    topics: topics?.n ?? 0,
    outcomes: outcomes?.n ?? 0,
    unverifiedOutcomes: unverified?.n ?? 0,
  };
}

export type VersionStatusRow = { id: string; code: string; status: VersionStatus };

/** The status of a version, or null. Write functions use it to refuse changes to locked versions. */
export async function getVersionStatus(db: Database, versionId: string): Promise<VersionStatusRow | null> {
  const [row] = await db
    .select({ id: curriculumVersions.id, code: curriculumVersions.code, status: curriculumVersions.status })
    .from(curriculumVersions)
    .where(eq(curriculumVersions.id, versionId))
    .limit(1);
  return row ?? null;
}
