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
import { listPapersForAssessments } from "@/repositories/postgres/papers";
import { getReadyDb } from "@/repositories/postgres/ready";
import { getParentChildren } from "./children";

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
  return {
    children,
    selectedChildId: selectedChildId ?? undefined,
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
    // Marked attempts join once results exist; until then an attempt is given, in progress or handed in.
    attempts: attemptHeaders.flatMap((header) => {
      const { attempt } = header;
      if (attempt.status === "marked") return [];
      return [
        {
          id: attempt.id,
          childId: attempt.childId,
          paperId: attempt.paperId,
          status: attempt.status,
          startedAt: (attempt.startedAt ?? attempt.assignedAt).toISOString(),
          label: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber),
        },
      ];
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
