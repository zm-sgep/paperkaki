"use server";

import { redirect } from "next/navigation";
import { pairDevice, CODE_ATTEMPT_MESSAGE } from "@/application/commands/child-devices";
import { startChildSession } from "@/application/commands/child-session";
import { getRequestId } from "@/lib/request-context";

export type PairState = { error?: string };

/** The child types the code from their parent. Any failure gets the same calm message. */
export async function pairDeviceAction(_previous: PairState, formData: FormData): Promise<PairState> {
  const raw = formData.get("code");
  const result = await pairDevice(typeof raw === "string" ? raw : "", { requestId: (await getRequestId()) ?? null });
  if (!result.ok) return { error: CODE_ATTEMPT_MESSAGE };
  await startChildSession(result.sessionToken);
  redirect("/today");
}
