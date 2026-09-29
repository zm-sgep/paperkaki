import { InputError, NotFoundError } from "@/application/errors";
import { buildAssessmentPlan, syncBlueprint } from "@/application/assessment-plan";
import { getCurriculumVersionForLevel } from "@/application/queries/curriculum";
import {
  deriveAssessmentName,
  recommendPaperSettings,
  todayInSingapore,
  validateAssessmentDate,
  type AssessmentType,
} from "@/domain/assessments";
import { recordAuditEvent } from "@/lib/audit";
import type { Database } from "@/repositories/postgres/client";
import {
  getOwnedAssessment,
  getOwnedChild,
  getRequirements,
  insertAssessment,
  listScopeItems,
  listTopicsInVersion,
  replaceScopeItems,
  setAssessmentStatus,
  upsertRequirements,
  type OwnedAssessment,
} from "@/repositories/postgres/assessments";
import type { Assessment } from "@/repositories/postgres/schema";
import {
  AssessmentTypeSchema,
  NicknameSchema,
  PaperSettingsInputSchema,
  SUPPORTED_SUBJECT,
  fieldErrorsOf,
  type PaperSettingsInput,
} from "@/schemas/assessment-setup";
import { createChildInTransaction, resolveCommandDb, selectChildInTransaction, type CommandContext } from "./children";

/**
 * Assessment setup commands (M3-02 to M3-04). Each takes the signed-in parent's id and works
 * only on that parent's children and assessments; anything else is "not found" (a 404).
 */

const LEVEL = "P3";

async function requireOwnedAssessment(db: Database, parentProfileId: string, assessmentId: string): Promise<OwnedAssessment> {
  const assessment = await getOwnedAssessment(db, parentProfileId, assessmentId);
  if (!assessment || assessment.childArchived) throw new NotFoundError();
  return assessment;
}

export type CreateAssessmentInput = {
  /** An existing child of this parent... */
  childId?: string | undefined;
  /** ...or the nickname of a first child to create in the same step. */
  newChildNickname?: string | undefined;
  type: string;
  /** Only used when the type is "other". */
  customName?: string | undefined;
  /** "YYYY-MM-DD", today or later in Singapore. */
  date: string;
};

export async function createAssessment(
  parentProfileId: string,
  input: CreateAssessmentInput,
  context: CommandContext = {},
): Promise<Assessment> {
  const db = await resolveCommandDb(context);
  const errors: Record<string, string> = {};

  const type = AssessmentTypeSchema.safeParse(input.type);
  if (!type.success) errors.type = type.error.issues[0]?.message ?? "Choose the assessment.";

  const name = type.success ? deriveAssessmentName(type.data, input.customName) : null;
  if (name && !name.ok) errors.customName = name.message;

  const dateCheck = validateAssessmentDate(input.date, todayInSingapore(context.now));
  if (!dateCheck.ok) errors.date = dateCheck.message;

  if (!input.childId) {
    const nickname = NicknameSchema.safeParse(input.newChildNickname ?? "");
    if (!nickname.success) errors.nickname = nickname.error.issues[0]?.message ?? "Enter your child's name or nickname.";
  }
  if (Object.keys(errors).length > 0) throw new InputError(errors);
  if (!type.success || !name?.ok) throw new InputError(errors);

  const version = await getCurriculumVersionForLevel(
    { subject: SUPPORTED_SUBJECT, level: LEVEL, audience: "public" },
    { db },
  );
  if (!version) {
    throw new InputError({ form: "Primary 3 Mathematics isn't available yet. Please try again later." });
  }

  return db.transaction(async (tx) => {
    let childId = input.childId;
    if (childId) {
      const child = await getOwnedChild(tx, parentProfileId, childId);
      if (!child || child.archivedAt) throw new NotFoundError();
    } else {
      childId = (await createChildInTransaction(tx, parentProfileId, { nickname: input.newChildNickname ?? "", level: LEVEL }, context)).id;
    }
    const assessment = await insertAssessment(tx, {
      childId,
      curriculumVersionId: version.id,
      subject: SUPPORTED_SUBJECT,
      level: LEVEL,
      assessmentType: type.data satisfies AssessmentType,
      name: name.name,
      date: input.date,
    });
    // Whoever the parent just set up becomes the child shown next.
    await selectChildInTransaction(tx, parentProfileId, childId);
    await recordAuditEvent(tx, {
      action: "assessment.created",
      entityType: "assessment",
      entityId: assessment.id,
      actorProfileId: parentProfileId,
      metadata: { assessmentType: assessment.assessmentType, curriculumVersionId: version.id },
      requestId: context.requestId ?? null,
    });
    return assessment;
  });
}

/**
 * Saves the topics the parent ticked. Only topics of the assessment's own curriculum version are
 * accepted, and every outcome of each chosen topic is stored. Changing the topics of a confirmed
 * assessment sends it back to draft until the parent confirms again.
 */
export async function setAssessmentScope(
  parentProfileId: string,
  assessmentId: string,
  topicIds: readonly string[],
  context: CommandContext = {},
): Promise<void> {
  const db = await resolveCommandDb(context);
  await db.transaction(async (tx) => {
    const assessment = await requireOwnedAssessment(tx, parentProfileId, assessmentId);
    const wanted = [...new Set(topicIds)];
    if (wanted.length === 0) throw new InputError({ topics: "Tick at least one topic." });

    const versionTopics = await listTopicsInVersion(tx, assessment.curriculumVersionId, assessment.level);
    const allowed = new Map(versionTopics.map((topic) => [topic.topicId, topic]));
    if (wanted.some((id) => !allowed.has(id))) {
      throw new InputError({ topics: "One of those topics isn't part of this assessment. Please choose again." });
    }

    const items = versionTopics
      .filter((topic) => wanted.includes(topic.topicId))
      .flatMap((topic) => topic.outcomeIds.map((outcomeId) => ({ topicId: topic.topicId, outcomeId })));

    const before = new Set((await listScopeItems(tx, assessmentId)).map((item) => item.outcomeId));
    const unchanged = before.size === items.length && items.every((item) => before.has(item.outcomeId));
    if (unchanged) return;

    await replaceScopeItems(tx, assessmentId, items);
    if (assessment.status === "scope_confirmed") {
      await setAssessmentStatus(tx, assessmentId, "draft", context.now ?? new Date());
    }
  });
}

/** Confirms the saved topics, stores the recommended settings if none exist, and records the paper design. */
export async function confirmScope(
  parentProfileId: string,
  assessmentId: string,
  context: CommandContext = {},
): Promise<void> {
  const db = await resolveCommandDb(context);
  await db.transaction(async (tx) => {
    const assessment = await requireOwnedAssessment(tx, parentProfileId, assessmentId);
    const scope = await listScopeItems(tx, assessmentId);
    if (scope.length === 0) throw new InputError({ topics: "Tick at least one topic." });

    const wasConfirmed = assessment.status === "scope_confirmed";
    if (!wasConfirmed) {
      await setAssessmentStatus(tx, assessmentId, "scope_confirmed", context.now ?? new Date());
    }
    const confirmed: OwnedAssessment = wasConfirmed ? assessment : { ...assessment, status: "scope_confirmed" };

    // Recommended settings follow the topics until the parent changes them.
    const stored = await getRequirements(tx, assessmentId);
    if (!stored || stored.source === "recommended") {
      const plan = await buildAssessmentPlan(tx, confirmed);
      await upsertRequirements(tx, assessmentId, { ...recommendPaperSettings({ topicCount: plan.included.length }), source: "recommended" });
    }
    await syncBlueprint(tx, confirmed);

    if (!wasConfirmed) {
      await recordAuditEvent(tx, {
        action: "assessment.scope_confirmed",
        entityType: "assessment",
        entityId: assessmentId,
        actorProfileId: parentProfileId,
        metadata: { outcomeCount: scope.length },
        requestId: context.requestId ?? null,
      });
    }
  });
}

/** Saves the parent's own paper settings. They are stored apart from the topics. */
export async function setPaperSettings(
  parentProfileId: string,
  assessmentId: string,
  input: PaperSettingsInput,
  context: CommandContext = {},
): Promise<void> {
  const db = await resolveCommandDb(context);
  const parsed = PaperSettingsInputSchema.safeParse(input);
  if (!parsed.success) throw new InputError(fieldErrorsOf(parsed.error));
  await db.transaction(async (tx) => {
    const assessment = await requireOwnedAssessment(tx, parentProfileId, assessmentId);
    await upsertRequirements(tx, assessmentId, { ...parsed.data, source: "parent" });
    await syncBlueprint(tx, assessment);
  });
}

/** "Use recommended settings": back to the suggestion for the chosen topics. */
export async function resetToRecommendedSettings(
  parentProfileId: string,
  assessmentId: string,
  context: CommandContext = {},
): Promise<void> {
  const db = await resolveCommandDb(context);
  await db.transaction(async (tx) => {
    const assessment = await requireOwnedAssessment(tx, parentProfileId, assessmentId);
    const plan = await buildAssessmentPlan(tx, assessment);
    await upsertRequirements(tx, assessmentId, { ...recommendPaperSettings({ topicCount: plan.included.length }), source: "recommended" });
    await syncBlueprint(tx, assessment);
  });
}

