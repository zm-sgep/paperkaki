import {
  buildBlueprint,
  explainForParent,
  adaptiveFocusText,
  excludedTopicsNotice,
  formatSummaryLine,
  formatTotalMarks,
  joinLabels,
  paperFormatChoices,
  recommendPaperFormat,
  recommendPaperSettings,
  sameFormat,
  standardFormatVariants,
  validateBlueprint,
  type Blueprint,
  type DifficultyLevel,
  type FormatChoice,
  type FormatChoiceId,
  type Issue,
  type PaperFormat,
  type PaperSettings,
} from "@/domain/assessments";
import { adaptiveFocus, applyFocus, selectQuestions, summariseInventory, type AdaptiveFocus, type SelectionResult } from "@/domain/papers";
import { getLearningMap } from "@/application/queries/learning-map";
import type { MasteryState } from "@/domain/mastery";
import { getLatestPaperNumber } from "@/repositories/postgres/papers";
import type { Database } from "@/repositories/postgres/client";
import {
  getLatestBlueprint,
  getRequirements,
  getSchoolPaperFormat,
  insertBlueprintVersion,
  listScopeItems,
  listTopicsInVersion,
  type OwnedAssessment,
} from "@/repositories/postgres/assessments";
import { parsePaperFormat } from "@/schemas/paper-format";
import { listCandidateQuestions, type QuestionCandidate } from "./queries/questions";

/**
 * Turns an assessment's confirmed scope and paper settings into the internal paper design and
 * checks it against the approved question bank. Shared by the setup query (which only reads) and
 * the commands (which store a new blueprint version when the design changed).
 *
 * The parent's scope is the truth: a topic the bank cannot cover yet stays in the scope, but is
 * left out of the design explicitly and named in `excludedNotice`.
 *
 * The paper format follows the same rule as the other settings: until the parent chooses one it is
 * the recommendation (the child's saved format first, else by assessment type); once they choose,
 * it stays as they chose.
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
  /** Marks and time always equal the paper format's own. */
  settings: PaperSettings;
  /** The parts of the paper the mock follows. */
  format: PaperFormat;
  /** Which ready-made choice the format is, or "custom" for the parent's own. */
  selectedChoice: FormatChoiceId | "custom";
  recommendedChoice: FormatChoiceId;
  /** The recommended choice's format (for "standard", the format the marks and time give). */
  recommendedFormat: PaperFormat;
  /** Every ready-made choice, the recommended one first. */
  formatChoices: FormatChoice[];
  /** The format saved for this child and assessment type, if any. */
  savedFormat: PaperFormat | null;
  blueprint: Blueprint;
  /** Hard problems, in the parent's words, each with the way forward. */
  problems: string[];
  /** Gentle heads-ups, in the parent's words. */
  notices: string[];
  candidates: QuestionCandidate[];
  inventory: { topicId: string; label: string; questionCount: number }[];
  selection: SelectionResult | null;
  /**
   * How a later mock leans, when the child's work says where. Null for the first mock and while nothing is
   * known. Internal: parents only ever read `focusLine`.
   */
  focus: (AdaptiveFocus & { mockNumber: number }) | null;
  /** "Mock 2 will focus a little more on Length and Time, and still cover every topic." Null when nothing stands out. */
  focusLine: string | null;
  /** "50 marks · 1 h 30 min · Sections A, B, C" */
  summary: string;
  /** "Fractions, Time, Angles" */
  topicsLine: string;
  canGenerate: boolean;
};

const PREVIEW_SEED = "preview";

/** JSON form of a format, for storage. */
export function formatToJson(format: PaperFormat): Record<string, unknown> {
  return JSON.parse(JSON.stringify(format)) as Record<string, unknown>;
}

/**
 * Where the next mock should lean, from what the child has shown. Only for Mock 2 and later, and only once
 * there is evidence; otherwise the marks are shared evenly, as for the first mock.
 */
async function focusForNextMock(
  db: Database,
  assessment: OwnedAssessment,
  blueprint: Blueprint,
  candidates: readonly QuestionCandidate[],
  now: Date,
): Promise<(AdaptiveFocus & { mockNumber: number }) | null> {
  const mockNumber = (await getLatestPaperNumber(db, assessment.id)) + 1;
  if (mockNumber < 2) return null;
  const map = await getLearningMap(assessment.childId, { db, now });
  if (!map || map.topics.every((topic) => topic.mastery.state === "not_started")) return null;
  const topicOf = new Map(map.topics.map((topic) => [topic.topicId, topic]));
  // Only skills the bank can test count: a skill with no questions could never improve.
  const testable = new Set(candidates.map((candidate) => candidate.primaryOutcomeId));
  const scope = blueprint.scope.map((item) => ({ topicId: item.topicId, outcomeIds: item.outcomeIds.filter((id) => testable.has(id)) }));
  const outcomes = scope.flatMap((item) =>
    item.outcomeIds.map((outcomeId) => {
      const outcome = topicOf.get(item.topicId)?.testable.find((entry) => entry.outcomeId === outcomeId);
      return {
        outcomeId,
        topicId: item.topicId,
        state: outcome?.attention ?? ("not_started" as MasteryState),
        ...(outcome?.mastery.reviewDueAt ? { reviewDueAt: outcome.mastery.reviewDueAt } : {}),
      };
    }),
  );
  const topics = scope.map((item) => ({ topicId: item.topicId, state: topicOf.get(item.topicId)?.mastery.attention ?? ("not_started" as MasteryState) }));
  return { ...adaptiveFocus({ scope, totalMarks: blueprint.totalMarks, topics, outcomes, now: now.toISOString() }), mockNumber };
}

export async function buildAssessmentPlan(db: Database, assessment: OwnedAssessment, options: { now?: Date } = {}): Promise<AssessmentPlan> {
  const now = options.now ?? new Date();
  const [scopeItems, versionTopics, requirements, savedJson] = await Promise.all([
    listScopeItems(db, assessment.id),
    listTopicsInVersion(db, assessment.curriculumVersionId, assessment.level),
    getRequirements(db, assessment.id),
    getSchoolPaperFormat(db, assessment.parentProfileId, assessment.childId, assessment.assessmentType),
  ]);
  const savedFormat = parsePaperFormat(savedJson) ?? null;

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
  const topics = included.map((topic) => ({ topicId: topic.topicId, label: topic.label, outcomeIds: topic.outcomeIds }));

  const recommendation = recommendPaperFormat({
    assessmentType: assessment.assessmentType,
    topicCount: included.length,
    savedFormat,
  });
  const recommendedSettings: PaperSettings =
    recommendation.choice === "standard"
      ? recommendPaperSettings({ topicCount: included.length })
      : {
          totalMarks: formatTotalMarks(recommendation.format),
          durationMinutes: recommendation.format.durationMinutes,
          difficulty: "balanced",
        };
  const formatChoices = paperFormatChoices({ assessmentType: assessment.assessmentType, topicCount: included.length, savedFormat });

  // What is in force: the parent's own choice, or the recommendation.
  const parentChose = requirements?.source === "parent";
  const storedFormat = parentChose ? (parsePaperFormat(requirements.paperFormat) ?? null) : null;
  const difficulty: DifficultyLevel = parentChose ? requirements.difficulty : recommendedSettings.difficulty;
  const standardSettings = parentChose
    ? { totalMarks: requirements.totalMarks, durationMinutes: requirements.durationMinutes }
    : recommendedSettings;
  const explicitFormat = parentChose ? storedFormat : recommendation.choice === "standard" ? null : recommendation.format;

  const draft = (format: PaperFormat | undefined): Blueprint =>
    buildBlueprint({
      curriculumVersionId: assessment.curriculumVersionId,
      level: "P3",
      subject: "Mathematics",
      topics,
      settings: { ...standardSettings, difficulty },
      format,
    });
  const check = (blueprint: Blueprint): { errors: Issue[]; warnings: Issue[] } =>
    validateBlueprint(blueprint, summariseInventory(blueprint.scope, blueprint.format, candidates));

  // The standard mock has several ways to split the short-answer marks; use the first the bank can fill.
  let blueprint: Blueprint;
  if (explicitFormat) {
    blueprint = draft(explicitFormat);
  } else {
    const variants = standardFormatVariants(standardSettings);
    const workable = variants.find((variant) => check(draft(variant)).errors.length === 0) ?? variants[0];
    blueprint = draft(workable);
  }
  // A later mock leans a little towards what needs work. The format and the topics stay exactly as chosen.
  const focus = await focusForNextMock(db, assessment, blueprint, candidates, now);
  if (focus) blueprint = { ...blueprint, scope: applyFocus(blueprint.scope, focus) };
  const format = blueprint.format;
  const settings: PaperSettings = {
    totalMarks: blueprint.totalMarks,
    durationMinutes: blueprint.durationMinutes,
    difficulty,
  };

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
      : check(blueprint);

  const problems = explainForParent(issues.errors);
  const notices = explainForParent(issues.warnings);

  let selection: SelectionResult | null = null;
  if (problems.length === 0) {
    selection = selectQuestions({
      blueprint,
      candidates,
      seed: PREVIEW_SEED,
      ...(focus ? { outcomeBoost: focus.outcomeBoost, dueOutcomeIds: focus.dueOutcomeIds } : {}),
    });
    if (!selection.ok) {
      problems.push(
        selection.failure.code === "topic_not_covered"
          ? "We couldn't fit every topic into this paper format. Choose fewer topics or a different paper format."
          : "We couldn't fit questions to this paper format exactly. Try a different paper format or add another topic.",
      );
    }
  }

  const matching = explicitFormat ? formatChoices.find((choice) => sameFormat(choice.format, format)) : undefined;
  const selectedChoice: FormatChoiceId | "custom" = explicitFormat ? (matching?.id ?? "custom") : "standard";

  return {
    chosen: chosenTopics.map(({ topicId, label }) => ({ topicId, label })),
    included,
    excluded,
    excludedNotice: excludedTopicsNotice(
      excluded.map((topic) => topic.label),
      included.length,
    ),
    storedSettingsSource: requirements?.source ?? "recommended",
    recommended: recommendedSettings,
    settings,
    format,
    selectedChoice,
    recommendedChoice: recommendation.choice,
    recommendedFormat: recommendation.format,
    formatChoices,
    savedFormat,
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
    focus,
    focusLine: focus
      ? adaptiveFocusText(
          focus.mockNumber,
          focus.focusTopicIds.map((id) => blueprint.scope.find((item) => item.topicId === id)?.label ?? "").filter((label) => label !== ""),
        )
      : null,
    summary: formatSummaryLine(format),
    topicsLine: included.map((topic) => topic.label).join(", "),
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
export async function syncBlueprint(db: Database, assessment: OwnedAssessment, now?: Date): Promise<number | null> {
  if (assessment.status !== "scope_confirmed") return null;
  const plan = await buildAssessmentPlan(db, assessment, now ? { now } : {});
  if (plan.blueprint.scope.length === 0) return null;
  const latest = await getLatestBlueprint(db, assessment.id);
  const spec = plan.blueprint as unknown as Record<string, unknown>;
  if (latest && canonicalJson(latest.spec) === canonicalJson(spec)) return latest.version;
  const version = (latest?.version ?? 0) + 1;
  await insertBlueprintVersion(db, {
    assessmentId: assessment.id,
    version,
    spec,
    scope: plan.blueprint.scope.map((item) => ({ topicId: item.topicId, targetMarks: item.targetMarks })),
  });
  return version;
}
