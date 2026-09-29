import {
  buildBlueprint,
  explainForParent,
  recommendPaperSettings,
  validateBlueprint,
  excludedTopicsNotice,
  joinLabels,
  summaryLine,
  type Blueprint,
  type Issue,
  type PaperSettings,
} from "@/domain/assessments";
import { selectQuestions, summariseInventory, type SelectionResult } from "@/domain/papers";
import type { Database } from "@/repositories/postgres/client";
import {
  getLatestBlueprint,
  getRequirements,
  insertBlueprintVersion,
  listScopeItems,
  listTopicsInVersion,
  type OwnedAssessment,
} from "@/repositories/postgres/assessments";
import { listCandidateQuestions, type QuestionCandidate } from "./queries/questions";

/**
 * Turns an assessment's confirmed scope and paper settings into the internal paper design and
 * checks it against the approved question bank. Shared by the setup query (which only reads) and
 * the commands (which store a new blueprint version when the design changed).
 *
 * The parent's scope is the truth: a topic the bank cannot cover yet stays in the scope, but is
 * left out of the design explicitly and named in `excludedNotice`.
 */

export type AssessmentPlan = {
  /** Every topic the parent chose, in curriculum order. */
  chosen: { topicId: string; label: string }[];
  /** Chosen topics the mock will cover. */
  included: { topicId: string; label: string; outcomeIds: string[] }[];
  excluded: { topicId: string; label: string }[];
  excludedNotice: string | null;
  storedSettingsSource: "recommended" | "parent";
  recommended: PaperSettings;
  settings: PaperSettings;
  blueprint: Blueprint;
  /** Hard problems, in the parent's words, each with the way forward. */
  problems: string[];
  /** Gentle heads-ups, in the parent's words. */
  notices: string[];
  candidates: QuestionCandidate[];
  inventory: { topicId: string; label: string; questionCount: number }[];
  selection: SelectionResult | null;
  summary: string;
  canGenerate: boolean;
};

const PREVIEW_SEED = "preview";

export async function buildAssessmentPlan(db: Database, assessment: OwnedAssessment): Promise<AssessmentPlan> {
  const [scopeItems, versionTopics, requirements] = await Promise.all([
    listScopeItems(db, assessment.id),
    listTopicsInVersion(db, assessment.curriculumVersionId, assessment.level),
    getRequirements(db, assessment.id),
  ]);

  const storedOutcomes = new Set(scopeItems.map((item) => item.outcomeId));
  const chosenTopics = versionTopics
    .filter((topic) => topic.outcomeIds.some((id) => storedOutcomes.has(id)))
    .map((topic) => ({
      topicId: topic.topicId,
      label: topic.label,
      outcomeIds: topic.outcomeIds.filter((id) => storedOutcomes.has(id)),
    }));

  const candidates = await listCandidateQuestions(
    {
      curriculumVersionId: assessment.curriculumVersionId,
      outcomeIds: chosenTopics.flatMap((topic) => topic.outcomeIds),
      level: assessment.level,
      subject: assessment.subject,
    },
    { db },
  );

  const covered = new Set(candidates.map((candidate) => candidate.topicId));
  const included = chosenTopics.filter((topic) => covered.has(topic.topicId));
  const excluded = chosenTopics.filter((topic) => !covered.has(topic.topicId)).map(({ topicId, label }) => ({ topicId, label }));

  const recommended = recommendPaperSettings({ topicCount: included.length });
  const settings: PaperSettings =
    requirements?.source === "parent"
      ? { totalMarks: requirements.totalMarks, durationMinutes: requirements.durationMinutes, difficulty: requirements.difficulty }
      : recommended;

  const blueprint = buildBlueprint({
    curriculumVersionId: assessment.curriculumVersionId,
    level: "P3",
    subject: "Mathematics",
    topics: included.map((topic) => ({ topicId: topic.topicId, label: topic.label, outcomeIds: topic.outcomeIds })),
    settings,
  });

  const inventory = summariseInventory(blueprint.scope, blueprint.sections, candidates);
  const issues: { errors: Issue[]; warnings: Issue[] } =
    included.length === 0 && chosenTopics.length > 0
      ? {
          errors: [
            {
              code: "topic_has_no_questions",
              message: `We don't have questions for ${joinLabels(chosenTopics.map((t) => t.label))} yet. Change topics to add another one.`,
            },
          ],
          warnings: [],
        }
      : validateBlueprint(blueprint, inventory);

  const problems = explainForParent(issues.errors);
  const notices = explainForParent(issues.warnings);

  let selection: SelectionResult | null = null;
  if (problems.length === 0) {
    selection = selectQuestions({ blueprint, candidates, seed: PREVIEW_SEED });
    if (!selection.ok) {
      problems.push("We couldn't fit questions to those exact marks. Try a different number of marks or add another topic.");
    }
  }

  return {
    chosen: chosenTopics.map(({ topicId, label }) => ({ topicId, label })),
    included,
    excluded,
    excludedNotice: excludedTopicsNotice(
      excluded.map((topic) => topic.label),
      included.length,
    ),
    storedSettingsSource: requirements?.source ?? "recommended",
    recommended,
    settings,
    blueprint,
    problems,
    notices,
    candidates,
    inventory: included.map((topic) => ({
      topicId: topic.topicId,
      label: topic.label,
      questionCount: candidates.filter((c) => c.topicId === topic.topicId).length,
    })),
    selection,
    summary: summaryLine({
      totalMarks: settings.totalMarks,
      durationMinutes: settings.durationMinutes,
      topicLabels: included.map((topic) => topic.label),
    }),
    canGenerate: problems.length === 0 && included.length > 0,
  };
}

/** Deterministic JSON with sorted keys: jsonb does not keep key order, so specs are compared this way. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Stores the current design as a new blueprint version when it differs from the latest one.
 * Returns the version number now in force, or null when there is nothing to design (no topic
 * the bank can cover). Called after the scope is confirmed or the settings change.
 */
export async function syncBlueprint(db: Database, assessment: OwnedAssessment): Promise<number | null> {
  if (assessment.status !== "scope_confirmed") return null;
  const plan = await buildAssessmentPlan(db, assessment);
  if (plan.blueprint.scope.length === 0) return null;
  const latest = await getLatestBlueprint(db, assessment.id);
  const spec = plan.blueprint as unknown as Record<string, unknown>;
  if (latest && canonicalJson(latest.spec) === canonicalJson(spec)) return latest.version;
  const version = (latest?.version ?? 0) + 1;
  await insertBlueprintVersion(db, {
    assessmentId: assessment.id,
    version,
    spec,
    scope: plan.blueprint.scope.map((item) => ({
      topicId: item.topicId,
      targetMarks: item.targetMarks,
      sectionAMarks: item.sectionMarks.A,
      sectionBMarks: item.sectionMarks.B,
    })),
  });
  return version;
}
