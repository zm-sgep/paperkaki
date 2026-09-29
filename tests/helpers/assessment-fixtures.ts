import { confirmScope, createAssessment, setAssessmentScope } from "@/application/commands/assessments";
import { getScopeSetup } from "@/application/queries/assessment-setup";
import type { Database } from "@/repositories/postgres/client";

/** Fixed "now" (Singapore date 2026-09-29) so date rules do not depend on the day the tests run. */
export const NOW = new Date("2026-09-29T02:00:00Z");
export const DATE_OK = "2026-10-14";

/**
 * A new WA2 with the topics whose parent label starts with each prefix ("Fractions", "Whole"),
 * scope confirmed and a blueprint stored: everything a mock needs. Returns the assessment id.
 */
export async function confirmedAssessment(
  db: Database,
  parentProfileId: string,
  topicPrefixes: readonly string[],
  options: { childId?: string; nickname?: string } = {},
): Promise<{ assessmentId: string; childId: string; topicIds: string[] }> {
  const context = { db, now: NOW };
  const assessment = await createAssessment(
    parentProfileId,
    options.childId
      ? { childId: options.childId, type: "wa2", date: DATE_OK }
      : { newChildNickname: options.nickname ?? "Test Child A", type: "wa2", date: DATE_OK },
    context,
  );
  const setup = await getScopeSetup(parentProfileId, assessment.id, context);
  if (!setup) throw new Error("no scope setup");
  const topicIds = topicPrefixes.map((prefix) => {
    const topic = setup.topics.find((candidate) => candidate.label.startsWith(prefix));
    if (!topic) throw new Error(`no topic starting with ${prefix}`);
    return topic.id;
  });
  await setAssessmentScope(parentProfileId, assessment.id, topicIds, context);
  await confirmScope(parentProfileId, assessment.id, context);
  return { assessmentId: assessment.id, childId: assessment.childId, topicIds };
}
