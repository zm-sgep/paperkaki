"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createPairingCode, handDeviceToChild, removeChildDevice } from "@/application/commands/child-devices";
import { startChildSession } from "@/application/commands/child-session";
import { NotFoundError } from "@/application/errors";
import { getCurrentChild } from "@/application/queries/current-child";
import { requireParent } from "@/application/queries/current-parent";
import { env } from "@/config/env";
import { formatPairingCode } from "@/domain/attempts";
import { getRequestId } from "@/lib/request-context";
import { SESSION_COOKIE_NAME } from "@/services/auth";
import { cookies } from "next/headers";

export type PairingState = { code?: string; link?: string; error?: string };

/** "Set up Darius's iPad": a fresh six-digit code, valid for ten minutes. */
export async function createPairingCodeAction(childId: string): Promise<PairingState> {
  const parent = await requireParent();
  try {
    const { code } = await createPairingCode(parent.parentProfileId, childId, { requestId: (await getRequestId()) ?? null });
    return { code: formatPairingCode(code), link: `${env.APP_BASE_URL.replace(/\/$/, "")}/child` };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/**
 * "Hand this device to Darius": this browser becomes Darius's. If it is already one of Darius's
 * set-up devices, that session is reused, so the device list does not grow with every hand-over.
 */
export async function handDeviceAction(childId: string): Promise<void> {
  const parent = await requireParent();
  try {
    const existing = await getCurrentChild();
    if (existing && existing.childId === childId && existing.parentProfileId === parent.parentProfileId) {
      (await cookies()).delete(SESSION_COOKIE_NAME);
    } else {
      const session = await handDeviceToChild(parent.parentProfileId, childId, { requestId: (await getRequestId()) ?? null });
      await startChildSession(session.sessionToken);
    }
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  redirect("/today");
}

export async function removeDeviceAction(deviceId: string): Promise<void> {
  const parent = await requireParent();
  try {
    await removeChildDevice(parent.parentProfileId, deviceId, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/account");
}
