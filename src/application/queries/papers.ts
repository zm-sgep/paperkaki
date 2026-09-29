import { issueFileUrl } from "@/application/files";
import {
  formatAssessmentDate,
  todayInSingapore,
} from "@/domain/assessments";
import { ANSWER_PACK_NOTE, mockReadyHeading, mockSummaryLine, printTip } from "@/domain/papers";
import { formatSummaryLine } from "@/domain/assessments";
import { parsePaperFormat } from "@/schemas/paper-format";
import type { Database } from "@/repositories/postgres/client";
import { getOwnedPaper, type OwnedPaper } from "@/repositories/postgres/papers";
import { getReadyDb } from "@/repositories/postgres/ready";
import { isStorageBucket, type StorageService } from "@/services/storage";

type Context = { db?: Database; now?: Date; storage?: StorageService };

async function resolveDb(context: Context): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export type MockFileKind = "student" | "answers";

export type MockPage = {
  paperId: string;
  assessmentId: string;
  number: number;
  heading: string;
  /** "Test Child A · Mathematics WA2 · Tue 14 Oct" */
  contextLine: string;
  /** "40 marks · 45 min · Sections A, B" */
  summary: string;
  /** "Fractions, Whole numbers" */
  topicsLine: string;
  tip: string;
  answerPackNote: string;
  /** Local links that redirect to a fresh short-lived signed URL, after an ownership check. */
  studentHref: string;
  answersHref: string;
  backHref: string;
};

type SpecShape = { totalMarks?: unknown; durationMinutes?: unknown; scope?: unknown; format?: unknown };

/** Marks, minutes and topic labels of the blueprint version the paper was built from. */
function summaryOf(paper: OwnedPaper): { totalMarks: number; durationMinutes: number; topicLabels: string[]; line: string } {
  const spec = paper.blueprintSpec as SpecShape;
  const scope = Array.isArray(spec.scope) ? (spec.scope as { label?: unknown }[]) : [];
  const totalMarks = typeof spec.totalMarks === "number" ? spec.totalMarks : 0;
  const durationMinutes = typeof spec.durationMinutes === "number" ? spec.durationMinutes : 0;
  const format = parsePaperFormat(spec.format);
  return {
    totalMarks,
    durationMinutes,
    topicLabels: scope.map((topic) => topic.label).filter((label): label is string => typeof label === "string"),
    // A paper made before paper formats existed has no format: fall back to marks and time.
    line: format ? formatSummaryLine(format) : mockSummaryLine({ totalMarks, durationMinutes, topicLabels: [] }),
  };
}

/** The "Mock N is ready" screen. Null when the paper is not this parent's, or is not in this assessment. */
export async function getMockPage(
  parentProfileId: string,
  assessmentId: string,
  paperId: string,
  context: Context = {},
): Promise<MockPage | null> {
  const paper = await getOwnedPaper(await resolveDb(context), parentProfileId, paperId);
  if (!paper || paper.assessmentId !== assessmentId) return null;
  const summary = summaryOf(paper);
  const today = todayInSingapore(context.now);
  const base = `/prepare/${assessmentId}/mocks/${paperId}`;
  return {
    paperId,
    assessmentId,
    number: paper.number,
    heading: mockReadyHeading(paper.number),
    contextLine: `${paper.childNickname} · ${paper.assessmentSubject} ${paper.assessmentName} · ${formatAssessmentDate(paper.assessmentDate, today)}`,
    summary: summary.line,
    topicsLine: summary.topicLabels.join(", "),
    tip: printTip(paper.childNickname, summary.durationMinutes),
    answerPackNote: ANSWER_PACK_NOTE,
    studentHref: `${base}/download/student`,
    answersHref: `${base}/download/answers`,
    backHref: `/prepare/${assessmentId}`,
  };
}

/**
 * A five-minute signed link to one of this parent's paper files, or null when the paper is not
 * theirs. The owner comes from the database row that stores the file's bucket and key.
 */
export async function getMockDownloadUrl(
  actor: { parentProfileId: string; role: "parent" | "admin" },
  assessmentId: string,
  paperId: string,
  kind: MockFileKind,
  context: Context = {},
): Promise<string | null> {
  const paper = await getOwnedPaper(await resolveDb(context), actor.parentProfileId, paperId);
  if (!paper || paper.assessmentId !== assessmentId) return null;
  const bucket = kind === "student" ? paper.studentPdfBucket : paper.answerPdfBucket;
  const key = kind === "student" ? paper.studentPdfKey : paper.answerPdfKey;
  if (!isStorageBucket(bucket)) return null;
  return issueFileUrl(
    actor,
    { bucket, key, ownerParentProfileId: paper.ownerParentProfileId },
    context.storage ? { storage: context.storage } : {},
  );
}
