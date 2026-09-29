"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { archiveChild, createChild, updateChild } from "@/application/commands/children";
import { InputError, NotFoundError } from "@/application/errors";
import { requireParent } from "@/application/queries/current-parent";
import { getRequestId } from "@/lib/request-context";

export type ChildFormState = { error?: string; done?: boolean };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function run(work: (parentProfileId: string, context: { requestId: string | null }) => Promise<void>): Promise<ChildFormState> {
  const parent = await requireParent();
  try {
    await work(parent.parentProfileId, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof InputError) return { error: error.fieldErrors.nickname ?? error.message };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  return { done: true };
}

export async function addChildAction(_previous: ChildFormState, formData: FormData): Promise<ChildFormState> {
  return run(async (parentProfileId, context) => {
    await createChild(parentProfileId, { nickname: text(formData, "nickname") }, context);
  });
}

export async function renameChildAction(childId: string, _previous: ChildFormState, formData: FormData): Promise<ChildFormState> {
  return run(async (parentProfileId, context) => {
    await updateChild(parentProfileId, childId, { nickname: text(formData, "nickname") }, context);
  });
}

export async function archiveChildAction(childId: string): Promise<void> {
  await run(async (parentProfileId, context) => {
    await archiveChild(parentProfileId, childId, context);
  });
}
