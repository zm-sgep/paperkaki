import type { SelectableTopicsQuery, SelectableTopicsResponse } from "@/schemas/curriculum-selection";
import { getCurriculumTree, getCurriculumVersionForLevel, type QueryContext } from "./curriculum";

/**
 * The topics and outcomes a parent can choose from when setting up an assessment (M1-07),
 * from the latest PUBLISHED curriculum version for the subject and level. Drafts and retired
 * versions are never included. Topics follow curriculum order (domain, then topic sort order);
 * outcomes follow their sort order. Null when nothing is published for that subject and level.
 */
export async function listSelectableTopics(
  query: SelectableTopicsQuery,
  context: QueryContext = {},
): Promise<SelectableTopicsResponse | null> {
  const version = await getCurriculumVersionForLevel({ subject: query.subject, level: query.level, audience: "public" }, context);
  if (!version) {
    return null;
  }
  const tree = await getCurriculumTree(version.id, { audience: "public", level: query.level }, context);
  if (!tree) {
    return null;
  }
  return {
    curriculumVersionId: version.id,
    topics: tree.domains.flatMap((domain) =>
      domain.topics.map((topic) => ({
        id: topic.id,
        code: topic.code,
        label: topic.parentLabel,
        outcomes: topic.outcomes.map((outcome) => ({ id: outcome.id, code: outcome.code, label: outcome.childLabel })),
      })),
    ),
  };
}
