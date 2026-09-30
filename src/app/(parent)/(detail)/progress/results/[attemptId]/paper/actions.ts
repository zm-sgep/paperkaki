"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markMistakesReviewed } from "@/application/commands/marking-review";
import { requireParent } from "@/application/queries/current-parent";

/** "We've been through the mistakes": Home stops asking, and the parent goes back to it. */
export async function finishReviewAction(attemptId: string): Promise<void> {
  const parent = await requireParent();
  await markMistakesReviewed({ parentProfileId: parent.parentProfileId }, attemptId);
  revalidatePath("/", "layout");
  redirect("/home");
}
