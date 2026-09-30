import { getJobService } from "@/application/jobs";
import { RETRYABLE_FAILURES, type NoticeFailureCode } from "@/application/notice-processing";
import { loadPublishedTopics } from "@/application/notice-topics";
import {
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABEL,
  durationText,
  formatAssessmentDate,
  formatSummaryLine,
  futureFormatLabel,
  partSummary,
  reviewFormat,
  todayInSingapore,
  type AssessmentType,
  type SectionKind,
} from "@/domain/assessments";
import type { Database } from "@/repositories/postgres/client";
import { getOwnedChild } from "@/repositories/postgres/assessments";
import { getOwnedSource } from "@/repositories/postgres/assessment-sources";
import { getReadyDb } from "@/repositories/postgres/ready";
import { StoredNoticeSchema } from "@/schemas/notice-extraction";
import type { JobService } from "@/services/jobs";

type Context = { db?: Database; now?: Date; jobs?: Pick<JobService, "recover" | "runOverdue"> | undefined };

async function resolveDb(context: Context): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export type NoticeStatus = {
  status: "queued" | "running" | "succeeded" | "failed";
  failureCode: string | null;
};

/**
 * Where reading a notice stands, for this parent's own source. Null when it is not theirs (a 404).
 * Reading the status also gives a job that was lost in a restart its second chance.
 */
export async function getNoticeStatus(parentProfileId: string, sourceId: string, context: Context = {}): Promise<NoticeStatus | null> {
  const db = await resolveDb(context);
  const source = await getOwnedSource(db, parentProfileId, sourceId);
  if (!source) return null;
  if (source.status === "queued" || source.status === "running") {
    const jobs = context.jobs ?? (await getJobService());
    await jobs.recover();
    await jobs.runOverdue();
    const again = await getOwnedSource(db, parentProfileId, sourceId);
    if (!again) return null;
    return { status: again.status, failureCode: again.failureCode };
  }
  return { status: source.status, failureCode: source.failureCode };
}

export type NoticePartView = {
  label: string;
  booklet: string;
  kind: SectionKind;
  questionCount: number;
  totalMarks: number;
  summary: string;
  check: boolean;
};

export type NoticeReviewView = {
  sourceId: string;
  childNickname: string;
  multipleSubjects: boolean;
  assessment: {
    type: AssessmentType;
    typeLabel: string;
    /** The parent's own name, for "Other". */
    customName: string;
    name: string;
    date: string;
    dateText: string;
    durationMinutes: number | null;
    durationText: string | null;
    startTime: string | null;
    check: { type: boolean; date: boolean; duration: boolean };
  };
  /** The topics the notice named, in curriculum order, in the parent's words. */
  topics: { code: string; label: string; check: boolean }[];
  /** Every topic, for adding one under Edit. */
  allTopics: { code: string; label: string; selected: boolean }[];
  appliesAcross: boolean;
  unmatchedLabels: string[];
  format: { parts: NoticePartView[]; totalMarks: number; summary: string | null } | null;
  notes: string[];
  typeOptions: { value: AssessmentType; label: string }[];
  today: string;
  futureLabel: string;
};

export type NoticeScreen =
  | { state: "processing" }
  | { state: "failed"; code: NoticeFailureCode; retry: boolean }
  | { state: "found"; view: NoticeReviewView }
  | { state: "confirmed"; assessmentId: string };

/** What screen B shows for this source: still reading, failed with a reason, or the review to check. Null when it is not theirs. */
export async function getNoticeScreen(parentProfileId: string, sourceId: string, context: Context = {}): Promise<NoticeScreen | null> {
  const db = await resolveDb(context);
  const status = await getNoticeStatus(parentProfileId, sourceId, { ...context, db });
  if (!status) return null;
  const source = await getOwnedSource(db, parentProfileId, sourceId);
  if (!source) return null;
  if (source.assessmentId) return { state: "confirmed", assessmentId: source.assessmentId };
  if (status.status === "queued" || status.status === "running") return { state: "processing" };
  if (status.status === "failed") {
    const code = (status.failureCode ?? "internal") as NoticeFailureCode;
    return { state: "failed", code, retry: RETRYABLE_FAILURES.includes(code) };
  }

  const stored = StoredNoticeSchema.safeParse(source.extraction);
  const child = await getOwnedChild(db, parentProfileId, source.childId);
  const published = await loadPublishedTopics(db);
  if (!stored.success || !child || !published) return { state: "failed", code: "internal", retry: true };

  const { review } = stored.data;
  const today = todayInSingapore(context.now);
  const label = new Map(published.topics.map((topic) => [topic.code, topic.label]));
  const selected = new Set(review.topics.map((topic) => topic.code));
  const checked = new Map(review.topics.map((topic) => [topic.code, topic.check]));
  const date = review.assessment.date ?? "";
  const duration = review.assessment.durationMinutes;
  const format = reviewFormat(review);
  const withDuration = review.format
    ? {
        parts: review.format.parts.map(
          (part): NoticePartView => ({
            label: part.label,
            booklet: part.booklet ?? "",
            kind: part.kind,
            questionCount: part.questionCount,
            totalMarks: part.totalMarks,
            summary: partSummary(part),
            check: part.check,
          }),
        ),
        totalMarks: review.format.parts.reduce((sum, part) => sum + part.totalMarks, 0),
        summary: format ? formatSummaryLine(format) : null,
      }
    : null;

  return {
    state: "found",
    view: {
      sourceId,
      childNickname: child.nickname,
      multipleSubjects: review.multipleSubjects,
      assessment: {
        type: review.assessment.type,
        typeLabel: ASSESSMENT_TYPE_LABEL[review.assessment.type],
        customName: review.assessment.type === "other" ? review.assessment.name : "",
        name: review.assessment.name,
        date,
        dateText: date ? formatAssessmentDate(date, today) : "",
        durationMinutes: duration,
        durationText: duration === null ? null : durationText(duration),
        startTime: review.assessment.startTime,
        check: review.assessment.check,
      },
      topics: published.topics
        .filter((topic) => selected.has(topic.code))
        .map((topic) => ({ code: topic.code, label: topic.label, check: checked.get(topic.code) ?? false })),
      allTopics: published.topics.map((topic) => ({ code: topic.code, label: label.get(topic.code) ?? topic.label, selected: selected.has(topic.code) })),
      appliesAcross: review.appliesAcross,
      unmatchedLabels: review.unmatchedLabels,
      format: withDuration,
      notes: review.notes,
      typeOptions: ASSESSMENT_TYPES.map((value) => ({ value, label: ASSESSMENT_TYPE_LABEL[value] })),
      today,
      futureLabel: futureFormatLabel(child.nickname, review.assessment.type, review.assessment.name),
    },
  };
}
