"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  approveRequest,
  createReward,
  fulfilRequest,
  giveBonus,
  rejectRequest,
  setRewardActive,
  updateReward,
} from "@/application/commands/rewards";
import { InputError, NotFoundError } from "@/application/errors";
import { requireParent } from "@/application/queries/current-parent";
import { getRequestId } from "@/lib/request-context";

export type RewardFormState = { status: "idle" } | { status: "done"; message: string } | { status: "error"; errors: Record<string, string> };
export type DecisionResult = { ok: true } | { ok: false; error: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

const rewardFields = (formData: FormData) => ({
  title: text(formData, "title"),
  description: text(formData, "description"),
  cost: text(formData, "cost"),
  icon: text(formData, "icon") || "gift",
  childId: text(formData, "childId"),
  weeklyLimit: text(formData, "weeklyLimit"),
  availableFrom: text(formData, "availableFrom"),
  availableUntil: text(formData, "availableUntil"),
});

async function run(work: (parentProfileId: string, context: { requestId: string | null }) => Promise<string>): Promise<RewardFormState> {
  const parent = await requireParent();
  try {
    const message = await work(parent.parentProfileId, { requestId: (await getRequestId()) ?? null });
    revalidatePath("/", "layout");
    return { status: "done", message };
  } catch (error) {
    if (error instanceof InputError) return { status: "error", errors: error.fieldErrors };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function createRewardAction(_previous: RewardFormState, formData: FormData): Promise<RewardFormState> {
  return run(async (parentProfileId, context) => {
    await createReward(parentProfileId, rewardFields(formData), context);
    return "Reward added.";
  });
}

export async function updateRewardAction(rewardId: string, _previous: RewardFormState, formData: FormData): Promise<RewardFormState> {
  return run(async (parentProfileId, context) => {
    await updateReward(parentProfileId, rewardId, rewardFields(formData), context);
    return "Saved.";
  });
}

export async function giveBonusAction(childId: string, _previous: RewardFormState, formData: FormData): Promise<RewardFormState> {
  return run(async (parentProfileId, context) => {
    const { given, points } = await giveBonus(
      parentProfileId,
      childId,
      { points: text(formData, "points"), reason: text(formData, "reason") },
      text(formData, "submissionId"),
      context,
    );
    return given ? `Gave ${points} bonus ${points === 1 ? "point" : "points"}.` : "That bonus was already given.";
  });
}

export async function retireRewardAction(rewardId: string): Promise<void> {
  await run(async (parentProfileId, context) => {
    await setRewardActive(parentProfileId, rewardId, false, context);
    return "Retired.";
  });
}

export async function restoreRewardAction(rewardId: string): Promise<void> {
  await run(async (parentProfileId, context) => {
    await setRewardActive(parentProfileId, rewardId, true, context);
    return "Brought back.";
  });
}

async function decide(work: (parentProfileId: string, context: { requestId: string | null }) => Promise<void>): Promise<DecisionResult> {
  const parent = await requireParent();
  try {
    await work(parent.parentProfileId, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: Object.values(error.fieldErrors)[0] ?? error.message };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "Yes, approve": the points come off once, in the same step. */
export async function approveRequestAction(redemptionId: string): Promise<DecisionResult> {
  return decide((parentProfileId, context) => approveRequest(parentProfileId, redemptionId, context));
}

/** "Not now": no points move. */
export async function rejectRequestAction(redemptionId: string): Promise<DecisionResult> {
  return decide((parentProfileId, context) => rejectRequest(parentProfileId, redemptionId, context));
}

/** "Mark as given": the real reward has been handed over. */
export async function fulfilRequestAction(redemptionId: string): Promise<DecisionResult> {
  return decide((parentProfileId, context) => fulfilRequest(parentProfileId, redemptionId, context));
}
