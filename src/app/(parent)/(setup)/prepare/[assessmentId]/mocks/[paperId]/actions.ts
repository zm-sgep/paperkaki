"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { assignMockToChild } from "@/application/commands/attempts";
import { InputError, NotFoundError } from "@/application/errors";
import { requireParent } from "@/application/queries/current-parent";
import { getRequestId } from "@/lib/request-context";

export type AssignState = { error?: string };

/** "Do it on iPad instead": gives this mock to the child's Today screen. Pressing twice gives the same attempt. */
export async function assignToIpadAction(paperId: string): Promise<AssignState> {
  const parent = await requireParent();
  try {
    await assignMockToChild(parent.parentProfileId, paperId, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof InputError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return {};
}
