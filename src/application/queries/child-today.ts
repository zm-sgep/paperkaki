import { countdownText, formatAssessmentDate, todayInSingapore } from "@/domain/assessments/dates";
import { nextChildAction, type ChildAction, type ChildActionState } from "@/domain/recommendations/next-child-action";
import type { Database } from "@/repositories/postgres/client";
import { listAssessmentsForParent } from "@/repositories/postgres/assessments";
import { getReadyDb } from "@/repositories/postgres/ready";
import type { CurrentChild } from "./current-child";

type Context = { db?: Database; now?: Date };

export type ChildToday = {
  action: ChildAction;
  /** "Next: WA2 · Tue 14 Oct (in 12 days)". Null when no assessment is coming up. */
  countdownLine: string | null;
};

/** The state the child's next-action policy decides from. Grows as more kinds of activity exist. */
export async function getChildActionState(_child: CurrentChild, context: Context = {}): Promise<ChildActionState> {
  return { now: (context.now ?? new Date()).toISOString() };
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
