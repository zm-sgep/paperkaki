import { cookies } from "next/headers";
import { recordAuditEvent } from "@/lib/audit";
import { getRequestId } from "@/lib/request-context";
import { getReadyDb } from "@/repositories/postgres/ready";
import { SESSION_COOKIE_NAME, getAuthService } from "@/services/auth";

/** Clears the session cookie and records the sign-out when the session was still valid. */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const session = await getAuthService().readSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  cookieStore.delete(SESSION_COOKIE_NAME);
  if (session) {
    await recordAuditEvent(await getReadyDb(), {
      action: "auth.signed_out",
      entityType: "parent_profile",
      entityId: session.parentProfileId,
      actorProfileId: session.parentProfileId,
      requestId: (await getRequestId()) ?? null,
    });
  }
}
