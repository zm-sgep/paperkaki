"use server";

import { revalidatePath } from "next/cache";
import { cancelRequest, requestReward } from "@/application/commands/rewards";
import { InputError, NotFoundError } from "@/application/errors";
import { requireChild } from "@/application/queries/current-child";

export type AskResult = { ok: true } | { ok: false; error: string };

function messageOf(error: unknown): string | null {
  if (error instanceof InputError) return Object.values(error.fieldErrors)[0] ?? error.message;
  if (error instanceof NotFoundError) return "We can't find that reward any more.";
  return null;
}

/** "Yes, ask": sends the request to the grown-up. Nothing is taken off until they say yes. */
export async function askForRewardAction(rewardId: string): Promise<AskResult> {
  const child = await requireChild();
  try {
    await requestReward(child, rewardId);
  } catch (error) {
    const message = messageOf(error);
    if (message) return { ok: false, error: message };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "Take it back": withdraws a request that is still waiting. */
export async function takeBackRequestAction(redemptionId: string): Promise<void> {
  const child = await requireChild();
  try {
    await cancelRequest(child, redemptionId);
  } catch (error) {
    if (!(error instanceof InputError) && !(error instanceof NotFoundError)) throw error;
  }
  revalidatePath("/", "layout");
}
