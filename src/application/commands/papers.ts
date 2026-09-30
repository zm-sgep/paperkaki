import { and, eq, sql } from "drizzle-orm";
import { InputError, NotFoundError } from "@/application/errors";
import { buildAssessmentPlan, canonicalJson, syncBlueprint } from "@/application/assessment-plan";
import { loadPaperImages, loadPaperQuestions } from "@/application/paper-data";
import { buildAnswerPack, buildStudentPaper, type PaperContentQuestion } from "@/application/paper-documents";
import {
  MOCK_GENERATION_MESSAGES,
  explainPaperFailures,
  repeatsEarlierPaper,
  selectQuestions,
  validatePaper,
} from "@/domain/papers";
import { recordAuditEvent } from "@/lib/audit";
import { logger as appLogger } from "@/lib/logger";
import { getLatestBlueprint, getOwnedAssessment } from "@/repositories/postgres/assessments";
import {
  findPaperByRequestKey,
  getLatestPaperNumber,
  insertPaperWithQuestions,
  listPaperQuestionSets,
  listUsedQuestionIds,
} from "@/repositories/postgres/papers";
import { papers, type Paper } from "@/repositories/postgres/schema";
import { renderAnswerPackPdf, renderStudentPaperPdf } from "@/services/pdf";
import { getStorage, type StorageService } from "@/services/storage";
import { resolveCommandDb, type CommandContext } from "./children";

/**
 * Paper generation (M4-06): from a confirmed assessment to a frozen paper with a student PDF
 * and a parent answer pack, stored privately.
 *
 *   plan -> select (seeded, avoiding earlier mocks) -> validate -> build -> render -> store files
 *        -> ONE transaction: insert paper + questions, audit
 *
 * Everything that can fail (selection, validation, rendering, storing) happens BEFORE the paper
 * row exists, so a failure leaves nothing half-made: no paper, and the parent simply tries again.
 * A paper row therefore always has its question list and both PDF keys. The trade-off is that a
 * failure between storing the files and committing can leave two unreferenced files; they carry
 * the same key next time and are overwritten.
 *
 * Idempotency: the screen sends a request key. A repeated key returns the paper it made.
 */

export type MockFailureCode =
  | "not_ready"
  | "blocked"
  | "no_fit"
  | "no_different_paper"
  | "validation_failed"
  | "render_failed"
  | "storage_failed"
  | "changed_meanwhile"
  | "busy";

/** Generation stopped, nothing was saved. `problems` is in the parent's words, each with a way forward. */
export class MockGenerationError extends Error {
  readonly code: MockFailureCode;
  readonly problems: string[];
  constructor(code: MockFailureCode, problems: string[]) {
    super(problems[0] ?? "We couldn't create the mock.");
    this.name = "MockGenerationError";
    this.code = code;
    this.problems = problems;
  }
}

export type GenerateMockContext = CommandContext & { storage?: StorageService; logger?: { warn: (fields: Record<string, unknown>, message: string) => void } };

export type GenerateMockResult = { paperId: string; assessmentId: string; number: number; created: boolean };

const PAPER_BUCKET = "paper-pdfs";
const REQUEST_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function paperFileKeys(parentProfileId: string, assessmentId: string, number: number): { student: string; answers: string } {
  const base = `parents/${parentProfileId}/assessments/${assessmentId}/mock-${number}`;
  return { student: `${base}-student.pdf`, answers: `${base}-answers.pdf` };
}

function resultOf(paper: Paper, created: boolean): GenerateMockResult {
  return { paperId: paper.id, assessmentId: paper.assessmentId, number: paper.number, created };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
    const fields = cause as Error & { code?: string; constraint?: string };
    if (fields.code === "23505" && (fields.constraint === constraint || cause.message.includes(constraint))) return true;
  }
  return false;
}

/**
 * Creates the next mock for an assessment of this parent, or returns the one already made for this
 * request key. Anything that is not the parent's is "not found".
 */
export async function generateMock(
  parentProfileId: string,
  assessmentId: string,
  requestKey: string,
  context: GenerateMockContext = {},
): Promise<GenerateMockResult> {
  if (!REQUEST_KEY.test(requestKey)) throw new InputError({ form: "Something went wrong. Please try again." });
  const db = await resolveCommandDb(context);
  const storage = context.storage ?? getStorage();
  const log = context.logger ?? appLogger;
  const now = context.now ?? new Date();

  const assessment = await getOwnedAssessment(db, parentProfileId, assessmentId);
  if (!assessment || assessment.childArchived) throw new NotFoundError();

  // Idempotency first: a repeated request returns the paper it already made, whatever changed since.
  const existing = await findPaperByRequestKey(db, requestKey);
  if (existing) {
    if (existing.assessmentId !== assessmentId) throw new InputError({ form: "Something went wrong. Please try again." });
    return resultOf(existing, false);
  }

  if (assessment.status !== "scope_confirmed") {
    throw new MockGenerationError("not_ready", [MOCK_GENERATION_MESSAGES.notConfirmed]);
  }

  // The current design and the approved questions for it. Hard problems are the parent's to fix.
  const plan = await buildAssessmentPlan(db, assessment, { now });
  if (plan.problems.length > 0 || plan.included.length === 0) {
    throw new MockGenerationError("blocked", plan.problems.length > 0 ? plan.problems : [MOCK_GENERATION_MESSAGES.noFit]);
  }

  const earlier = await listPaperQuestionSets(db, assessmentId);
  const number = (await getLatestPaperNumber(db, assessmentId)) + 1;
  const seed = `${assessmentId}:${number}`;
  const avoidQuestionIds = await listUsedQuestionIds(db, assessmentId);

  const selection = selectQuestions({
    blueprint: plan.blueprint,
    candidates: plan.candidates,
    seed,
    avoidQuestionIds,
    ...(plan.focus ? { outcomeBoost: plan.focus.outcomeBoost, dueOutcomeIds: plan.focus.dueOutcomeIds } : {}),
  });
  if (!selection.ok) {
    log.warn({ assessmentId, failure: selection.failure.code }, "mock selection failed");
    throw new MockGenerationError("no_fit", [MOCK_GENERATION_MESSAGES.noFit]);
  }
  const chosenIds = selection.selection.map((q) => q.questionId);
  if (repeatsEarlierPaper(chosenIds, earlier)) {
    throw new MockGenerationError("no_different_paper", [MOCK_GENERATION_MESSAGES.noDifferentPaper]);
  }

  // Independent final check of the exact question versions, before anything is frozen or rendered.
  const loaded = await loadPaperQuestions(db, storage, chosenIds);
  const validation = validatePaper({ blueprint: plan.blueprint, selection: selection.selection, facts: loaded.map((q) => q.facts) });
  if (!validation.ok) {
    log.warn({ assessmentId, failures: validation.failures.map((f) => ({ code: f.code, number: f.number, questionId: f.questionId })) }, "mock validation failed");
    throw new MockGenerationError("validation_failed", explainPaperFailures(validation.failures));
  }

  // Build both documents from one list.
  const byId = new Map(loaded.map((q) => [q.questionId, q]));
  const topicLabels = new Map(plan.blueprint.scope.map((topic) => [topic.topicId, topic.label]));
  const questions: PaperContentQuestion[] = selection.selection.map((picked) => {
    const draft = byId.get(picked.questionId)?.draft;
    if (!draft) throw new MockGenerationError("validation_failed", explainPaperFailures([{ code: "unknown_question", detail: "missing draft" }]));
    return {
      number: picked.number,
      sectionCode: picked.sectionCode,
      marks: picked.marks,
      questionType: draft.questionType,
      content: draft.content,
      answer: draft.answer,
      workedSolution: draft.workedSolution,
      topicLabel: topicLabels.get(picked.topicId) ?? "",
    };
  });
  const input = { assessmentName: assessment.name, mockNumber: number, blueprint: plan.blueprint, questions };

  const keys = paperFileKeys(parentProfileId, assessmentId, number);
  try {
    const images = await loadPaperImages(storage, loaded);
    const options = { images, creationDate: context.now ?? new Date() };
    const [studentPdf, answerPdf] = await Promise.all([
      renderStudentPaperPdf(buildStudentPaper(input), options),
      renderAnswerPackPdf(buildAnswerPack(input), options),
    ]);
    try {
      await storage.put({ bucket: PAPER_BUCKET, key: keys.student, body: studentPdf, contentType: "application/pdf" });
      await storage.put({ bucket: PAPER_BUCKET, key: keys.answers, body: answerPdf, contentType: "application/pdf" });
    } catch (error) {
      log.warn({ assessmentId, error: error instanceof Error ? error.message : "unknown" }, "storing mock files failed");
      throw new MockGenerationError("storage_failed", [MOCK_GENERATION_MESSAGES.couldNotSave]);
    }
  } catch (error) {
    if (error instanceof MockGenerationError) throw error;
    log.warn({ assessmentId, error: error instanceof Error ? error.message : "unknown" }, "rendering mock failed");
    throw new MockGenerationError("render_failed", [MOCK_GENERATION_MESSAGES.couldNotRender]);
  }

  // Freeze: one transaction for the paper, its questions and the audit event.
  try {
    return await db.transaction(async (tx) => {
      // One generation at a time per assessment, so numbers and the idempotency check cannot race.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${assessmentId}, 0))`);
      const raced = await findPaperByRequestKey(tx, requestKey);
      if (raced) return resultOf(raced, false);

      const blueprintVersion = await syncBlueprint(tx, assessment, now);
      const blueprint = await getLatestBlueprint(tx, assessmentId);
      if (!blueprint || blueprintVersion !== blueprint.version || canonicalJson(blueprint.spec) !== canonicalJson(plan.blueprint)) {
        throw new MockGenerationError("changed_meanwhile", [MOCK_GENERATION_MESSAGES.changedMeanwhile]);
      }
      const taken = await tx.select({ id: papers.id }).from(papers).where(and(eq(papers.assessmentId, assessmentId), eq(papers.number, number))).limit(1);
      if (taken.length > 0) throw new MockGenerationError("busy", [MOCK_GENERATION_MESSAGES.busy]);

      const paper = await insertPaperWithQuestions(
        tx,
        {
          assessmentId,
          blueprintId: blueprint.id,
          number,
          seed,
          requestKey,
          selectionReport: {
            ...selection.report,
            scope: validation.scope,
            blueprintVersion: blueprint.version,
            questionCount: chosenIds.length,
            ...(plan.focus ? { adaptive: { mockNumber: plan.focus.mockNumber, focusTopicIds: plan.focus.focusTopicIds, dueOutcomeIds: plan.focus.dueOutcomeIds } } : {}),
          },
          studentPdfBucket: PAPER_BUCKET,
          studentPdfKey: keys.student,
          answerPdfBucket: PAPER_BUCKET,
          answerPdfKey: keys.answers,
          createdBy: parentProfileId,
        },
        selection.selection.map((q) => ({ position: q.number, sectionCode: q.sectionCode, questionId: q.questionId, marks: q.marks })),
      );
      await recordAuditEvent(tx, {
        action: "paper.generated",
        entityType: "paper",
        entityId: paper.id,
        actorProfileId: parentProfileId,
        metadata: {
          assessmentId,
          number,
          blueprintVersion: blueprint.version,
          questionCount: chosenIds.length,
          totalMarks: selection.report.totalMarks,
          usedAvoided: selection.report.usedAvoided,
        },
        requestId: context.requestId ?? null,
      });
      return resultOf(paper, true);
    });
  } catch (error) {
    if (error instanceof MockGenerationError) throw error;
    if (isUniqueViolation(error, "papers_request_key_key")) {
      const raced = await findPaperByRequestKey(db, requestKey);
      if (raced) return resultOf(raced, false);
    }
    if (isUniqueViolation(error, "papers_assessment_number_key")) {
      throw new MockGenerationError("busy", [MOCK_GENERATION_MESSAGES.busy]);
    }
    throw error;
  }
}
