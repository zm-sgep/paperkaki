import type { Candidate } from "@/domain/papers";
import { describeVerification, stemSummary, verifyQuestionAnswer, type VerificationResult } from "@/domain/questions";
import type { Database } from "@/repositories/postgres/client";
import { getReadyDb } from "@/repositories/postgres/ready";
import {
  getQuestion,
  getQuestionAssets,
  getQuestionOutcomes,
  listApprovedCandidates,
  listFamilyVersions,
  listQuestionEvents,
  listQuestionsPage,
  listReviews,
  type OutcomeMapping,
  type QuestionEvent,
  type QuestionListFilters,
  type QuestionListPage,
  type QuestionListRow,
  type QuestionWithFamily,
  type ReviewTrailEntry,
} from "@/repositories/postgres/questions";
import { QuestionContentSchema, type QuestionDraft } from "@/schemas/question-content";
import { rowToDraftInput, safeParseDraft } from "../question-drafts";
import { getCurriculumTree, listCurriculumVersions, type QueryContext } from "./curriculum";

/**
 * Question-bank queries. The admin queries are for pages that have passed `requireAdmin()`.
 * `listCandidateQuestions` is for the paper generator and returns approved questions only.
 */

async function resolveDb(context: QueryContext): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export type { QuestionListFilters };

export type AdminQuestionRow = Omit<QuestionListRow, "content"> & { summary: string };
export type AdminQuestionPage = Omit<QuestionListPage, "rows"> & { rows: AdminQuestionRow[] };

/** One page (25) of questions for the admin list; every filter narrows the result (AND). */
export async function listQuestionsForAdmin(
  filters: QuestionListFilters,
  page: number,
  context: QueryContext = {},
): Promise<AdminQuestionPage> {
  const result = await listQuestionsPage(await resolveDb(context), filters, page);
  return {
    ...result,
    rows: result.rows.map(({ content, ...row }) => {
      const parsed = QuestionContentSchema.safeParse(content);
      return { ...row, summary: parsed.success ? stemSummary(parsed.data) : "(this question cannot be read)" };
    }),
  };
}

export type QuestionCandidate = Candidate & { estimatedSeconds: number };

/**
 * Approved questions in one curriculum version whose PRIMARY outcome is one of `outcomeIds`,
 * for the paper generator. Draft, in-review and retired questions are never returned.
 */
export async function listCandidateQuestions(
  input: { curriculumVersionId: string; outcomeIds: readonly string[]; level: string; subject: string },
  context: QueryContext = {},
): Promise<QuestionCandidate[]> {
  return listApprovedCandidates(await resolveDb(context), input);
}

export type QuestionAdminDetail = {
  question: QuestionWithFamily;
  outcomes: OutcomeMapping[];
  /** Null when the stored data no longer passes the schema; `issues` says why. */
  draft: QuestionDraft | null;
  issues: string[];
  verification: VerificationResult | null;
  verificationSummary: ReturnType<typeof describeVerification> | null;
  reviews: ReviewTrailEntry[];
  events: QuestionEvent[];
  /** Other versions of the same family, oldest first. */
  versions: { id: string; version: number; status: QuestionWithFamily["status"] }[];
  assets: { objectKey: string; alt: string }[];
};

export async function getQuestionForAdmin(
  questionId: string,
  context: QueryContext = {},
): Promise<QuestionAdminDetail | null> {
  const db = await resolveDb(context);
  const question = await getQuestion(db, questionId);
  if (!question) return null;
  const [outcomes, reviews, events, versions, assets] = await Promise.all([
    getQuestionOutcomes(db, questionId),
    listReviews(db, questionId),
    listQuestionEvents(db, questionId),
    listFamilyVersions(db, question.familyId),
    getQuestionAssets(db, questionId),
  ]);
  const parsed = safeParseDraft(rowToDraftInput(question, outcomes));
  const verification = parsed.ok ? verifyQuestionAnswer(parsed.draft) : null;
  return {
    question,
    outcomes,
    draft: parsed.ok ? parsed.draft : null,
    issues: parsed.ok ? [] : parsed.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
    verification,
    verificationSummary: verification ? describeVerification(verification) : null,
    reviews,
    events,
    versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status })),
    assets: assets.map((a) => ({ objectKey: a.objectKey, alt: a.alt })),
  };
}

export type EditorTopic = {
  id: string;
  title: string;
  level: string;
  outcomes: { id: string; code: string; label: string; statement: string }[];
};

export type EditorOptions = {
  versions: { id: string; code: string; title: string; status: string }[];
  curriculumVersionId: string | null;
  levels: string[];
  topics: EditorTopic[];
};

/**
 * What the editor and the list filters offer: every curriculum version (drafts included, as
 * admins may write questions before a version is published) and the topics and outcomes of the
 * chosen one. Defaults to the newest published version, else the newest one.
 */
export async function getQuestionEditorOptions(
  requestedVersionId: string | null,
  context: QueryContext = {},
): Promise<EditorOptions> {
  const versions = await listCurriculumVersions(context);
  const chosen =
    versions.find((v) => v.id === requestedVersionId) ?? versions.find((v) => v.status === "published") ?? versions[0] ?? null;
  const tree = chosen ? await getCurriculumTree(chosen.id, { audience: "admin" }, context) : null;
  return {
    versions: versions.map((v) => ({ id: v.id, code: v.code, title: v.title, status: v.status })),
    curriculumVersionId: chosen?.id ?? null,
    levels: chosen?.levels ?? [],
    topics: (tree?.domains ?? []).flatMap((domain) =>
      domain.topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        level: topic.level,
        outcomes: topic.outcomes.map((o) => ({ id: o.id, code: o.code, label: o.childLabel, statement: o.statement })),
      })),
    ),
  };
}
