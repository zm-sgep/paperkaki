"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markMistakesReviewed } from "@/application/commands/marking-review";
import { requireChild } from "@/application/queries/current-child";

/** "I've been through my mistakes": Today moves on to the next mission. */
export async function finishReviewAction(attemptId: string): Promise<void> {
  const child = await requireChild();
  await markMistakesReviewed({ childId: child.childId }, attemptId);
  revalidatePath("/", "layout");
  redirect("/today");
}
