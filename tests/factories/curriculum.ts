import type { Database } from "@/repositories/postgres/client";
import {
  curriculumDomains,
  curriculumOutcomeSources,
  curriculumOutcomes,
  curriculumTopics,
  curriculumVersions,
  sourceDocuments,
  subjects,
  type CurriculumOutcome,
  type CurriculumTopic,
  type CurriculumVersion,
  type SourceDocument,
} from "@/repositories/postgres/schema";

/**
 * Small, obviously fictional curriculum rows for tests ("Test Subject", "TEST-V1").
 * The real P3 Mathematics curriculum is only used where a test says so.
 */

export async function insertTestSubject(db: Database, name = "Test Subject") {
  const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [row] = await db
    .insert(subjects)
    .values({ code, name })
    .onConflictDoUpdate({ target: subjects.code, set: { name } })
    .returning();
  if (!row) throw new Error("Factory insert returned no row.");
  return row;
}

export async function insertTestSource(db: Database, code = "src-test-1"): Promise<SourceDocument> {
  const [row] = await db
    .insert(sourceDocuments)
    .values({
      code,
      title: `Test source ${code}`,
      publisher: "Test Publisher",
      provenance: "official_moe",
      verification: "unverified",
    })
    .returning();
  if (!row) throw new Error("Factory insert returned no row.");
  return row;
}

export type TestVersionOptions = {
  code?: string;
  status?: CurriculumVersion["status"];
  levels?: string[];
  effectiveFrom?: string;
  publishedAt?: Date | null;
  subjectName?: string;
};

export async function insertTestVersion(db: Database, options: TestVersionOptions = {}): Promise<CurriculumVersion> {
  const subject = await insertTestSubject(db, options.subjectName);
  const status = options.status ?? "draft";
  const [row] = await db
    .insert(curriculumVersions)
    .values({
      code: options.code ?? "TEST-V1",
      subjectId: subject.id,
      title: "Test curriculum",
      levels: options.levels ?? ["P3"],
      status: "draft",
      effectiveFrom: options.effectiveFrom ?? "2025-10-01",
    })
    .returning();
  if (!row) throw new Error("Factory insert returned no row.");
  if (status === "draft") return row;
  return { ...row, status };
}

/** Inserts a domain, topic, outcome and one source link into a DRAFT version. */
export async function insertTestOutcomeTree(
  db: Database,
  versionId: string,
  sourceId: string,
  key = "1",
): Promise<{ topic: CurriculumTopic; outcome: CurriculumOutcome }> {
  const [domain] = await db
    .insert(curriculumDomains)
    .values({ curriculumVersionId: versionId, code: `D${key}`, title: `Domain ${key}`, sortOrder: 1 })
    .returning();
  if (!domain) throw new Error("Factory insert returned no row.");
  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumVersionId: versionId,
      domainId: domain.id,
      code: `T${key}`,
      title: `Topic ${key}`,
      parentLabel: `Topic ${key} for parents`,
      level: "P3",
      sortOrder: 1,
    })
    .returning();
  if (!topic) throw new Error("Factory insert returned no row.");
  const [outcome] = await db
    .insert(curriculumOutcomes)
    .values({
      curriculumVersionId: versionId,
      topicId: topic.id,
      code: `O${key}`,
      statement: `Outcome ${key} statement`,
      childLabel: `Outcome ${key} for children`,
      level: "P3",
      sortOrder: 1,
    })
    .returning();
  if (!outcome) throw new Error("Factory insert returned no row.");
  await db.insert(curriculumOutcomeSources).values({ outcomeId: outcome.id, sourceId, pageOrSection: "p. 1" });
  return { topic, outcome };
}
