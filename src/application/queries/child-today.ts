import { attemptLabel, formatDuration } from "@/domain/attempts";
import { countdownText, formatAssessmentDate, todayInSingapore } from "@/domain/assessments/dates";
import { nextChildAction, type ChildAction, type ChildActionState } from "@/domain/recommendations/next-child-action";
import type { Database } from "@/repositories/postgres/client";
import { listAssessmentsForParent } from "@/repositories/postgres/assessments";
import { listMarkedAttemptHeaders, listOpenAttemptHeaders } from "@/repositories/postgres/attempts";
import { markingSummaries } from "@/repositories/postgres/marking";
import { getReadyDb } from "@/repositories/postgres/ready";
import type { CurrentChild } from "./current-child";

type Context = { db?: Database; now?: Date };

export type ChildToday = {
  action: ChildAction;
  /** "Next: WA2 · Tue 14 Oct (in 12 days)". Null when no assessment is coming up. */
  countdownLine: string | null;
};

/** The state the child's next-action policy decides from. Grows as more kinds of activity exist. */
export async function getChildActionState(child: CurrentChild, context: Context = {}): Promise<ChildActionState> {
  const db = context.db ?? (await getReadyDb());
  const state: ChildActionState = { now: (context.now ?? new Date()).toISOString() };
  const open = await listOpenAttemptHeaders(db, child.childId);
  // A paper being sat comes first; among several, the one worked on most recently (headers are newest first).
  const inProgress = open.find((header) => header.attempt.status === "in_progress");
  if (inProgress) {
    state.unfinishedMock = {
      attemptId: inProgress.attempt.id,
      position: inProgress.attempt.currentPosition,
      total: inProgress.questionCount,
    };
  }
  const due = open.find((header) => header.attempt.status === "assigned");
  if (due) {
    state.dueMock = {
      attemptId: due.attempt.id,
      label: attemptLabel(due.assessmentSubject, due.assessmentName, due.paperNumber),
      durationText: formatDuration(due.attempt.timeLimitSeconds / 60),
    };
  }

  // Marked work: the newest result the child has not looked at, then the newest with mistakes not yet gone through.
  const marked = await listMarkedAttemptHeaders(db, child.childId);
  const summaries = await markingSummaries(db, marked.map((header) => header.attempt.id));
  const unseen = marked.find((header) => header.attempt.childResultSeenAt === null);
  if (unseen) {
    state.newResult = {
      resultId: unseen.attempt.id,
      label: attemptLabel(unseen.assessmentSubject, unseen.assessmentName, unseen.paperNumber),
    };
  }
  const withMistakes = marked.find((header) => header.attempt.mistakesReviewedAt === null && (summaries.get(header.attempt.id)?.mistakes ?? 0) > 0);
  if (withMistakes) state.mistakes = { count: summaries.get(withMistakes.attempt.id)?.mistakes ?? 0, resultId: withMistakes.attempt.id };
  return state;
}

/** Today: one mission, and one quiet line about the next assessment. Own child only. */
export async function getChildToday(child: CurrentChild, context: Context = {}): Promise<ChildToday> {
  const db = context.db ?? (await getReadyDb());
  const today = todayInSingapore(context.now);
  const [state, assessments] = await Promise.all([
    getChildActionState(child, context),
    listAssessmentsForParent(db, child.parentProfileId, child.childId),
  ]);
  const next = assessments
    .filter((assessment) => assessment.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
  return {
    action: nextChildAction(state),
    countdownLine: next ? `Next: ${next.name} · ${formatAssessmentDate(next.date, today)} (${countdownText(next.date, today)})` : null,
  };
}
