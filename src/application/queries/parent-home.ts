import {
  countdownText,
  formatAssessmentDate,
  todayInSingapore,
} from "@/domain/assessments/dates";
import {
  nearestUpcomingAssessment,
  nextParentAction,
  type ParentAction,
  type ParentActionState,
} from "@/domain/recommendations/next-parent-action";
import type { Database } from "@/repositories/postgres/client";
import { attemptLabel } from "@/domain/attempts";
import { listAssessmentsForParent } from "@/repositories/postgres/assessments";
import { listAttemptHeadersForParent } from "@/repositories/postgres/attempts";
import { markingSummaries } from "@/repositories/postgres/marking";
import { listPapersForAssessments } from "@/repositories/postgres/papers";
import { getReadyDb } from "@/repositories/postgres/ready";
import { getParentChildren } from "./children";
import { getPracticeSummary } from "./practice-summary";

export { todayInSingapore };

type Context = { db?: Database; now?: Date };

/**
 * What the parent's Home needs to decide the next action, from real data: the parent's active
 * children, the selected one, and their assessments in creation order, each with its generated mocks.
 */
export async function getParentHomeState(parentProfileId: string, context: Context = {}): Promise<ParentActionState> {
  const db = context.db ?? (await getReadyDb());
  const [{ children, selectedChildId }, assessments, attemptHeaders] = await Promise.all([
    getParentChildren(parentProfileId, { db }),
    listAssessmentsForParent(db, parentProfileId),
    listAttemptHeadersForParent(db, parentProfileId),
  ]);
  const papers = await listPapersForAssessments(db, assessments.map((assessment) => assessment.id));
  const summaries = await markingSummaries(
    db,
    attemptHeaders.filter((header) => header.attempt.status === "submitted" || header.attempt.status === "marked").map((header) => header.attempt.id),
  );
  // Practice for the child in view: what is worth practising, and what has been done since the last mock.
  const practice = selectedChildId ? await getPracticeSummary(selectedChildId, { db, now: context.now ?? new Date() }) : undefined;
  return {
    children,
    selectedChildId: selectedChildId ?? undefined,
    ...(practice
      ? {
          practice: {
            outcomes: practice.outcomes,
            sessionsSinceLastMock: practice.sessionsSinceLastMock,
            minutesToday: practice.minutesToday,
            setsToday: practice.setsToday,
            ...(practice.suggested ? { pendingSuggestion: { name: practice.suggested.name } } : {}),
          },
        }
      : {}),
    assessments: assessments.map((assessment) => ({
      id: assessment.id,
      childId: assessment.childId,
      name: assessment.name,
      subject: assessment.subject,
      date: assessment.date,
      scopeConfirmed: assessment.status === "scope_confirmed",
      papers: papers
        .filter((paper) => paper.assessmentId === assessment.id && paper.status === "generated")
        .map((paper) => ({ id: paper.id, number: paper.number, status: "ready" as const })),
    })),
    today: todayInSingapore(context.now),
    attempts: attemptHeaders.map((header) => {
      const { attempt } = header;
      const summary = summaries.get(attempt.id) ?? { waiting: 0, mistakes: 0 };
      const base = {
        id: attempt.id,
        childId: attempt.childId,
        paperId: attempt.paperId,
        startedAt: (attempt.markedAt ?? attempt.startedAt ?? attempt.assignedAt).toISOString(),
        label: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
      };
      if (attempt.status === "marked") {
        return {
          ...base,
          status: "marked" as const,
          resultId: attempt.id,
          resultSeen: attempt.parentResultSeenAt !== null,
          unreviewedMistakes: attempt.mistakesReviewedAt === null ? summary.mistakes : 0,
        };
      }
      // Handed in: still being marked, or marked except for a few answers that need the parent's quick check.
      if (attempt.status === "submitted" && attempt.markingStage === "done" && summary.waiting > 0) {
        return { ...base, status: "needs_review" as const, reviewCount: summary.waiting };
      }
      return { ...base, status: attempt.status };
    }),
  };
}

export async function getParentHomeAction(parentProfileId: string, context: Context = {}): Promise<ParentAction> {
  return nextParentAction(await getParentHomeState(parentProfileId, context));
}

export type ParentHome = {
  action: ParentAction;
  /** One compact line of context, e.g. "Next: WA2 · Tue 14 Oct (in 12 days)". Null when there is nothing to add. */
  contextLine: string | null;
};

export async function getParentHome(parentProfileId: string, context: Context = {}): Promise<ParentHome> {
  const state = await getParentHomeState(parentProfileId, context);
  const nearest = nearestUpcomingAssessment(state);
  return {
    action: nextParentAction(state),
    contextLine: nearest
      ? `Next: ${nearest.name} · ${formatAssessmentDate(nearest.date, state.today)} (${countdownText(nearest.date, state.today)})`
      : null,
  };
}
