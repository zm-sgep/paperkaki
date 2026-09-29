import type { CurriculumVersionSummary, CurriculumTree, DomainNode, OutcomeNode, TopicNode } from "./types";

export type FlatDomainRow = Omit<DomainNode, "topics">;
export type FlatTopicRow = Omit<TopicNode, "outcomes"> & { domainId: string };
export type FlatOutcomeRow = OutcomeNode & { topicId: string };

function bySortThenCode<T extends { sortOrder: number; code: string }>(left: T, right: T): number {
  return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code);
}

/**
 * Builds domains -> topics -> outcomes from flat rows, ordered by sort order and then code,
 * so the order never depends on how the database happened to return rows. Topics without a
 * matching domain and outcomes without a matching topic are dropped: a filtered query can
 * leave them behind and they must not appear as orphans.
 */
export function assembleCurriculumTree(
  version: CurriculumVersionSummary,
  domains: FlatDomainRow[],
  topics: FlatTopicRow[],
  outcomes: FlatOutcomeRow[],
): CurriculumTree {
  const outcomesByTopic = new Map<string, OutcomeNode[]>();
  for (const { topicId, ...outcome } of [...outcomes].sort(bySortThenCode)) {
    const list = outcomesByTopic.get(topicId) ?? [];
    list.push(outcome);
    outcomesByTopic.set(topicId, list);
  }

  const topicsByDomain = new Map<string, TopicNode[]>();
  for (const { domainId, ...topic } of [...topics].sort(bySortThenCode)) {
    const list = topicsByDomain.get(domainId) ?? [];
    list.push({ ...topic, outcomes: outcomesByTopic.get(topic.id) ?? [] });
    topicsByDomain.set(domainId, list);
  }

  return {
    version,
    domains: [...domains]
      .sort(bySortThenCode)
      .map((domain) => ({ ...domain, topics: topicsByDomain.get(domain.id) ?? [] }))
      .filter((domain) => domain.topics.length > 0),
  };
}
