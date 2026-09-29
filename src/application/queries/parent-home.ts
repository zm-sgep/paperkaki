import { nextParentAction, type ParentAction, type ParentActionState } from "@/domain/recommendations/next-parent-action";

/** Today's calendar date in Singapore, "YYYY-MM-DD". Assessments are dated in local school time. */
export function todayInSingapore(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * What the parent's Home needs to decide the next action. Children and assessments are not
 * stored yet, so this is empty; the next slice wires real data here without touching the page.
 */
export async function getParentHomeState(parentProfileId: string): Promise<ParentActionState> {
  void parentProfileId; // Used once children and assessments are read from the database.
  return { children: [], assessments: [], today: todayInSingapore() };
}

export async function getParentHomeAction(parentProfileId: string): Promise<ParentAction> {
  return nextParentAction(await getParentHomeState(parentProfileId));
}
