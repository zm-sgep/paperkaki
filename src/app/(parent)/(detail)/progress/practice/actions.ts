"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { suggestPractice } from "@/application/commands/practice";
import { NotFoundError } from "@/application/errors";
import { requireParent } from "@/application/queries/current-parent";

/** "Suggest to Darius": pins the topic as their next practice mission, then shows that it is done. */
export async function suggestPracticeAction(childId: string, topicId: string): Promise<void> {
  const parent = await requireParent();
  try {
    await suggestPractice(parent.parentProfileId, childId, topicId);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    redirect("/progress");
  }
  revalidatePath("/", "layout");
  redirect(`/progress/practice?topic=${encodeURIComponent(topicId)}`);
}
