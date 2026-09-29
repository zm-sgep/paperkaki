import { and, asc, eq, isNull } from "drizzle-orm";
import {
  CurriculumNotFoundError,
  CurriculumVersionLockedError,
  type SourceProvenance,
  type VerificationState,
} from "@/domain/curriculum";
import type { Database } from "./client";
import { getVersionStatus } from "./curriculum";
import {
  curriculumOutcomeSources,
  curriculumOutcomes,
  curriculumVersions,
  sourceDocuments,
  type CurriculumOutcomeSource,
  type SourceDocument,
} from "./schema";

/**
 * Curriculum writes. Each function that changes the contents of a version checks that the
 * version is still a draft and refuses otherwise (CurriculumVersionLockedError), before the
 * database trigger (drizzle/0002_curriculum_immutability.sql) would refuse the same change.
 * Business rules (who may verify, what may publish) live in src/domain/curriculum.
 */

/** Throws unless the version exists and is a draft. Returns its code. */
export async function assertDraftVersion(db: Database, versionId: string): Promise<{ id: string; code: string }> {
  const version = await getVersionStatus(db, versionId);
  if (!version) {
    throw new CurriculumNotFoundError("Curriculum version");
  }
  if (version.status !== "draft") {
    throw new CurriculumVersionLockedError(version.code, version.status);
  }
  return version;
}

export type SourceDocumentInput = {
  code: string;
  title: string;
  publisher: string;
  url: string | null;
  provenance: SourceProvenance;
  verification: VerificationState;
  accessedOn: string | null;
  notes: string | null;
};

export async function findSourceByCode(db: Database, code: string): Promise<SourceDocument | null> {
  const [row] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.code, code)).limit(1);
  return row ?? null;
}

export async function findSourceById(db: Database, sourceId: string): Promise<SourceDocument | null> {
  const [row] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, sourceId)).limit(1);
  return row ?? null;
}

export async function insertSourceDocument(db: Database, input: SourceDocumentInput): Promise<SourceDocument> {
  const [row] = await db.insert(sourceDocuments).values(input).returning();
  if (!row) {
    throw new Error("Source document was not stored.");
  }
  return row;
}

/** Updates a source found by code when any field differs. Returns whether anything changed. */
export async function updateSourceDocumentIfChanged(
  db: Database,
  existing: SourceDocument,
  input: SourceDocumentInput,
): Promise<boolean> {
  const same =
    existing.title === input.title &&
    existing.publisher === input.publisher &&
    existing.url === input.url &&
    existing.provenance === input.provenance &&
    existing.verification === input.verification &&
    existing.accessedOn === input.accessedOn &&
    existing.notes === input.notes;
  if (same) {
    return false;
  }
  await db.update(sourceDocuments).set(input).where(eq(sourceDocuments.id, existing.id));
  return true;
}

/** The outcome, only when it belongs to the given version. */
export async function getOutcomeInVersion(db: Database, versionId: string, outcomeId: string) {
  const [row] = await db
    .select({ id: curriculumOutcomes.id, code: curriculumOutcomes.code, verification: curriculumOutcomes.verification })
    .from(curriculumOutcomes)
    .where(and(eq(curriculumOutcomes.id, outcomeId), eq(curriculumOutcomes.curriculumVersionId, versionId)))
    .limit(1);
  return row ?? null;
}

export async function listOutcomeLinks(db: Database, outcomeId: string): Promise<CurriculumOutcomeSource[]> {
  return db
    .select()
    .from(curriculumOutcomeSources)
    .where(eq(curriculumOutcomeSources.outcomeId, outcomeId))
    .orderBy(asc(curriculumOutcomeSources.createdAt), asc(curriculumOutcomeSources.id));
}

/**
 * Links an outcome of a draft version to a source, with an optional page or section.
 * Linking the same outcome, source and page again returns the existing link (`created: false`).
 */
export async function linkOutcomeToSource(
  db: Database,
  input: { versionId: string; outcomeId: string; sourceId: string; pageOrSection: string | null },
): Promise<{ link: CurriculumOutcomeSource; created: boolean; outcomeCode: string }> {
  await assertDraftVersion(db, input.versionId);
  const outcome = await getOutcomeInVersion(db, input.versionId, input.outcomeId);
  if (!outcome) {
    throw new CurriculumNotFoundError("Outcome in this curriculum version");
  }
  if (!(await findSourceById(db, input.sourceId))) {
    throw new CurriculumNotFoundError("Source document");
  }

  const [created] = await db
    .insert(curriculumOutcomeSources)
    .values({ outcomeId: input.outcomeId, sourceId: input.sourceId, pageOrSection: input.pageOrSection })
    .onConflictDoNothing()
    .returning();
  if (created) {
    return { link: created, created: true, outcomeCode: outcome.code };
  }

  const [existing] = await db
    .select()
    .from(curriculumOutcomeSources)
    .where(
      and(
        eq(curriculumOutcomeSources.outcomeId, input.outcomeId),
        eq(curriculumOutcomeSources.sourceId, input.sourceId),
        input.pageOrSection === null
          ? isNull(curriculumOutcomeSources.pageOrSection)
          : eq(curriculumOutcomeSources.pageOrSection, input.pageOrSection),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("Source link was neither stored nor found.");
  }
  return { link: existing, created: false, outcomeCode: outcome.code };
}

/**
 * Gives an outcome a page or section: fills in the first link that has none, or, when every
 * link already has one, adds a further link to the same source.
 */
export async function attachPageReference(
  db: Database,
  input: { versionId: string; outcomeId: string; pageOrSection: string },
): Promise<void> {
  await assertDraftVersion(db, input.versionId);
  const links = await listOutcomeLinks(db, input.outcomeId);
  const pageless = links.find((link) => (link.pageOrSection ?? "").trim() === "");
  if (pageless) {
    await db
      .update(curriculumOutcomeSources)
      .set({ pageOrSection: input.pageOrSection })
      .where(eq(curriculumOutcomeSources.id, pageless.id));
    return;
  }
  const first = links[0];
  if (first) {
    await linkOutcomeToSource(db, {
      versionId: input.versionId,
      outcomeId: input.outcomeId,
      sourceId: first.sourceId,
      pageOrSection: input.pageOrSection,
    });
  }
}

/** Marks an outcome of a draft version verified by a named person. The rules are checked by the caller. */
export async function setOutcomeVerified(
  db: Database,
  input: { versionId: string; outcomeId: string; verifierProfileId: string; at: Date },
): Promise<{ outcomeCode: string; alreadyVerified: boolean }> {
  await assertDraftVersion(db, input.versionId);
  const outcome = await getOutcomeInVersion(db, input.versionId, input.outcomeId);
  if (!outcome) {
    throw new CurriculumNotFoundError("Outcome in this curriculum version");
  }
  await db
    .update(curriculumOutcomes)
    .set({ verification: "verified", verifiedBy: input.verifierProfileId, verifiedAt: input.at })
    .where(eq(curriculumOutcomes.id, input.outcomeId));
  return { outcomeCode: outcome.code, alreadyVerified: outcome.verification === "verified" };
}

/** Moves a draft version to published. The publish rules are checked by the caller. */
export async function setVersionPublished(
  db: Database,
  input: { versionId: string; publishedBy: string | null; at: Date },
): Promise<void> {
  await assertDraftVersion(db, input.versionId);
  await db
    .update(curriculumVersions)
    .set({ status: "published", publishedAt: input.at, publishedBy: input.publishedBy })
    .where(eq(curriculumVersions.id, input.versionId));
}

/** Moves a published version to retired. */
export async function setVersionRetired(db: Database, versionId: string): Promise<void> {
  const version = await getVersionStatus(db, versionId);
  if (!version) {
    throw new CurriculumNotFoundError("Curriculum version");
  }
  if (version.status !== "published") {
    throw new CurriculumVersionLockedError(version.code, version.status);
  }
  await db.update(curriculumVersions).set({ status: "retired" }).where(eq(curriculumVersions.id, versionId));
}
