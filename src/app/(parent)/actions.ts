"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { selectChild } from "@/application/commands/children";
import { requireParent } from "@/application/queries/current-parent";
import { NotFoundError } from "@/application/errors";
import { getRequestId } from "@/lib/request-context";

/** The top-bar child selector. A preference, not navigation: it only changes whose plan is shown. */
export async function selectChildAction(childId: string): Promise<void> {
  const parent = await requireParent();
  try {
    await selectChild(parent.parentProfileId, childId, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
}
