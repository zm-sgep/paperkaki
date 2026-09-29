import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  assessmentBlueprints,
  assessments,
  children,
  curriculumOutcomes,
  curriculumTopics,
  paperQuestions,
  papers,
  questionAssets,
  questionFamilies,
  questionOutcomes,
  questions,
  type NewPaper,
  type Paper,
  type QuestionAssetRow,
  type QuestionRow,
} from "./schema";
import type { OutcomeMapping } from "./questions";

/**
 * Persistence for frozen mock papers (M4). Reads that start from a paper id or an assessment id
 * take the parent's profile id and join through children, so a parent can only ever reach their
 * own papers: no match simply returns nothing. The database trigger in
 * drizzle/0007_paper_immutability.sql is the last line of defence for immutability.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}

// ---------------------------------------------------------------------------
// Questions for a paper
// ---------------------------------------------------------------------------

export type PaperQuestionSource = {
  question: QuestionRow & { familyCode: string; familyTitle: string };
  /** Every outcome mapping of this question, with the parent-facing label of each outcome's topic. */
  outcomes: (OutcomeMapping & { topicLabel: string })[];
  assets: QuestionAssetRow[];
};

/** The exact question versions, whatever their status, with mappings and assets. Order is by id. */
export async function listPaperQuestionSources(db: Database, questionIds: readonly string[]): Promise<PaperQuestionSource[]> {
  const ids = [...new Set(questionIds)].filter(isUuid);
  if (ids.length === 0) return [];
  const [rows, mappings, assets] = await Promise.all([
    db
      .select({ question: questions, familyCode: questionFamilies.code, familyTitle: questionFamilies.title })
      .from(questions)
      .innerJoin(questionFamilies, eq(questionFamilies.id, questions.familyId))
      .where(inArray(questions.id, ids))
      .orderBy(asc(questions.id)),
    db
      .select({
        questionId: questionOutcomes.questionId,
        outcomeId: curriculumOutcomes.id,
        code: curriculumOutcomes.code,
        role: questionOutcomes.role,
        statement: curriculumOutcomes.statement,
        childLabel: curriculumOutcomes.childLabel,
        topicId: curriculumTopics.id,
        topicTitle: curriculumTopics.title,
        topicLabel: curriculumTopics.parentLabel,
      })
      .from(questionOutcomes)
      .innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, questionOutcomes.outcomeId))
      .innerJoin(curriculumTopics, eq(curriculumTopics.id, curriculumOutcomes.topicId))
      .where(inArray(questionOutcomes.questionId, ids))
      .orderBy(
        sql`case ${questionOutcomes.role} when 'primary' then 0 when 'secondary' then 1 else 2 end`,
        asc(curriculumOutcomes.code),
      ),
    db.select().from(questionAssets).where(inArray(questionAssets.questionId, ids)).orderBy(asc(questionAssets.objectKey)),
  ]);
  return rows.map((row) => ({
    question: { ...row.question, familyCode: row.familyCode, familyTitle: row.familyTitle },
    outcomes: mappings
      .filter((m) => m.questionId === row.question.id)
      .map((m) => ({ outcomeId: m.outcomeId, code: m.code, role: m.role, statement: m.statement, childLabel: m.childLabel, topicId: m.topicId, topicTitle: m.topicTitle, topicLabel: m.topicLabel })),
    assets: assets.filter((asset) => asset.questionId === row.question.id),
  }));
}

// ---------------------------------------------------------------------------
// Papers of an assessment
// ---------------------------------------------------------------------------

/** Ids of every question used by any earlier paper of the assessment (retired papers included). */
export async function listUsedQuestionIds(db: Database, assessmentId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ questionId: paperQuestions.questionId })
    .from(paperQuestions)
    .innerJoin(papers, eq(papers.id, paperQuestions.paperId))
    .where(eq(papers.assessmentId, assessmentId));
  return rows.map((row) => row.questionId);
}

/** The question-id set of each earlier paper of the assessment. */
export async function listPaperQuestionSets(db: Database, assessmentId: string): Promise<{ paperId: string; number: number; questionIds: string[] }[]> {
  const rows = await db
    .select({ paperId: papers.id, number: papers.number, questionId: paperQuestions.questionId })
    .from(papers)
    .innerJoin(paperQuestions, eq(paperQuestions.paperId, papers.id))
    .where(eq(papers.assessmentId, assessmentId))
    .orderBy(asc(papers.number), asc(paperQuestions.position));
  const byPaper = new Map<string, { paperId: string; number: number; questionIds: string[] }>();
  for (const row of rows) {
    const entry = byPaper.get(row.paperId) ?? { paperId: row.paperId, number: row.number, questionIds: [] };
    entry.questionIds.push(row.questionId);
    byPaper.set(row.paperId, entry);
  }
  return [...byPaper.values()];
}

export async function getLatestPaperNumber(db: Database, assessmentId: string): Promise<number> {
  const [row] = await db
    .select({ number: papers.number })
    .from(papers)
    .where(eq(papers.assessmentId, assessmentId))
    .orderBy(desc(papers.number))
    .limit(1);
  return row?.number ?? 0;
}

export async function findPaperByRequestKey(db: Database, requestKey: string): Promise<Paper | null> {
  const [row] = await db.select().from(papers).where(eq(papers.requestKey, requestKey)).limit(1);
  return row ?? null;
}

export async function insertPaperWithQuestions(
  db: Database,
  paper: NewPaper,
  rows: { position: number; sectionCode: string; questionId: string; marks: number }[],
): Promise<Paper> {
  const [inserted] = await db.insert(papers).values(paper).returning();
  if (!inserted) throw new Error("Paper was not stored.");
  await db.insert(paperQuestions).values(rows.map((row) => ({ paperId: inserted.id, ...row })));
  return inserted;
}

// ---------------------------------------------------------------------------
// Ownership-scoped reads
// ---------------------------------------------------------------------------

export type OwnedPaper = Paper & {
  blueprintVersion: number;
  blueprintSpec: Record<string, unknown>;
  assessmentName: string;
  assessmentSubject: string;
  assessmentDate: string;
  childNickname: string;
  /** The parent profile that owns this paper, read from the database, for the file ownership check. */
  ownerParentProfileId: string;
};

/** One paper, only if its assessment's child belongs to this parent and is not archived. */
export async function getOwnedPaper(db: Database, parentProfileId: string, paperId: string): Promise<OwnedPaper | null> {
  if (!isUuid(paperId)) return null;
  const [row] = await db
    .select({
      paper: papers,
      blueprintVersion: assessmentBlueprints.version,
      blueprintSpec: assessmentBlueprints.spec,
      assessmentName: assessments.name,
      assessmentSubject: assessments.subject,
      assessmentDate: assessments.date,
      childNickname: children.nickname,
      owner: children.parentProfileId,
      archivedAt: children.archivedAt,
    })
    .from(papers)
    .innerJoin(assessments, eq(assessments.id, papers.assessmentId))
    .innerJoin(children, eq(children.id, assessments.childId))
    .innerJoin(assessmentBlueprints, eq(assessmentBlueprints.id, papers.blueprintId))
    .where(and(eq(papers.id, paperId), eq(children.parentProfileId, parentProfileId)))
    .limit(1);
  if (!row || row.archivedAt) return null;
  return {
    ...row.paper,
    blueprintVersion: row.blueprintVersion,
    blueprintSpec: row.blueprintSpec,
    assessmentName: row.assessmentName,
    assessmentSubject: row.assessmentSubject,
    assessmentDate: row.assessmentDate,
    childNickname: row.childNickname,
    ownerParentProfileId: row.owner,
  };
}

export type PaperListItem = { id: string; assessmentId: string; number: number; status: Paper["status"]; createdAt: Date };

/** Papers of these assessments (already known to be the parent's), newest number first per assessment. */
export async function listPapersForAssessments(db: Database, assessmentIds: readonly string[]): Promise<PaperListItem[]> {
  if (assessmentIds.length === 0) return [];
  return db
    .select({ id: papers.id, assessmentId: papers.assessmentId, number: papers.number, status: papers.status, createdAt: papers.createdAt })
    .from(papers)
    .where(inArray(papers.assessmentId, [...assessmentIds]))
    .orderBy(asc(papers.assessmentId), desc(papers.number));
}
