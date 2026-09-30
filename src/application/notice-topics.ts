import { buildAliasIndex, type AliasIndex } from "@/domain/assessments";
import type { Database } from "@/repositories/postgres/client";
import { listTopicsInVersion, type VersionTopic } from "@/repositories/postgres/assessments";
import { TopicAliasTableSchema } from "@/schemas/notice-extraction";
import { SUPPORTED_SUBJECT } from "@/schemas/assessment-setup";
import { getCurriculumVersionForLevel } from "@/application/queries/curriculum";
import aliasFile from "../../content/curriculum/topic-aliases.json";

/** The alias table (content/curriculum/topic-aliases.json), checked once when first used. */
let aliasIndex: AliasIndex | undefined;

export function getTopicAliasIndex(): AliasIndex {
  aliasIndex ??= buildAliasIndex(TopicAliasTableSchema.parse(aliasFile).aliases);
  return aliasIndex;
}

export const NOTICE_LEVEL = "P3";

/** The published Primary 3 Mathematics topics: the closed list a notice can be mapped onto. */
export async function loadPublishedTopics(db: Database): Promise<{ curriculumVersionId: string; topics: VersionTopic[] } | null> {
  const version = await getCurriculumVersionForLevel({ subject: SUPPORTED_SUBJECT, level: NOTICE_LEVEL, audience: "public" }, { db });
  if (!version) return null;
  return { curriculumVersionId: version.id, topics: await listTopicsInVersion(db, version.id, NOTICE_LEVEL) };
}
