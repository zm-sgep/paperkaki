import type {
  CurriculumAudience,
  CurriculumTree,
  CurriculumVersionSummary,
  OutcomeDetail,
  OutcomeNode,
} from "@/domain/curriculum";
import type { Database } from "@/repositories/postgres/client";
import {
  findVersionForSubjectLevel,
  getCurriculumTree as loadCurriculumTree,
  getOutcomeDetail,
  getVersion,
  listOutcomesByTopic,
  listVersions,
} from "@/repositories/postgres/curriculum";
import { getReadyDb } from "@/repositories/postgres/ready";

/**
 * Curriculum queries (M1-02). Every query is scoped to one curriculum version id. Parents and
 * children (audience "public") only ever reach published versions; "admin" callers must have
 * passed `requireAdmin()` first.
 */

export type QueryContext = { db?: Database };

async function resolveDb(context: QueryContext): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

/** The version for a public audience must be published; admins may open any status. */
async function readableVersion(
  db: Database,
  versionId: string,
  audience: CurriculumAudience,
): Promise<CurriculumVersionSummary | null> {
  const version = await getVersion(db, versionId);
  if (!version || (audience !== "admin" && version.status !== "published")) {
    return null;
  }
  return version;
}

/** All versions, newest first, for the admin curriculum browser. */
export async function listCurriculumVersions(context: QueryContext = {}): Promise<CurriculumVersionSummary[]> {
  return listVersions(await resolveDb(context));
}

/** The newest version of a subject that covers a level. Published only, unless the audience is admin. */
export async function getCurriculumVersionForLevel(
  input: { subject: string; level: string; audience: CurriculumAudience },
  context: QueryContext = {},
): Promise<CurriculumVersionSummary | null> {
  return findVersionForSubjectLevel(await resolveDb(context), input);
}

export async function getCurriculumTree(
  versionId: string,
  options: { audience: CurriculumAudience; level?: string; topicId?: string },
  context: QueryContext = {},
): Promise<CurriculumTree | null> {
  const db = await resolveDb(context);
  if (!(await readableVersion(db, versionId, options.audience))) {
    return null;
  }
  return loadCurriculumTree(db, versionId, { level: options.level, topicId: options.topicId });
}

/** Outcomes of one topic. Empty when the topic is not in this version (or the version is not readable). */
export async function listOutcomesForTopic(
  versionId: string,
  topicId: string,
  options: { audience: CurriculumAudience },
  context: QueryContext = {},
): Promise<OutcomeNode[]> {
  const db = await resolveDb(context);
  if (!(await readableVersion(db, versionId, options.audience))) {
    return [];
  }
  return listOutcomesByTopic(db, versionId, topicId);
}

/** One outcome with every source that backs it. Null when it is not in this version. */
export async function getOutcomeWithSources(
  versionId: string,
  outcomeId: string,
  options: { audience: CurriculumAudience },
  context: QueryContext = {},
): Promise<OutcomeDetail | null> {
  const db = await resolveDb(context);
  if (!(await readableVersion(db, versionId, options.audience))) {
    return null;
  }
  return getOutcomeDetail(db, versionId, outcomeId);
}
