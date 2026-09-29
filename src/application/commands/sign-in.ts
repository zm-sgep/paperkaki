import { cookies } from "next/headers";
import { recordAuditEvent } from "@/lib/audit";
import { getRequestId } from "@/lib/request-context";
import type { Database } from "@/repositories/postgres/client";
import { parentProfiles, type ParentProfile } from "@/repositories/postgres/schema";
import { getReadyDb } from "@/repositories/postgres/ready";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, getAuthService, type AuthService } from "@/services/auth";

export type SignInResult =
  | { ok: true; profile: ParentProfile; sessionToken: string }
  | { ok: false; reason: "invalid_email" };

/**
 * Turns what the person typed into a parent profile and a signed session value.
 *
 * The profile is found by (provider, subject), never by the raw email, so signing in as
 * "Parent@Example.test" and "parent@example.test" reaches one profile. The audit event holds
 * ids and the provider name only.
 */
export async function signIn(
  deps: { db: Database; auth: AuthService },
  input: { email: string; requestId?: string | undefined; now?: Date },
): Promise<SignInResult> {
  const identity = await deps.auth.authenticate({ email: input.email });
  if (!identity) {
    return { ok: false, reason: "invalid_email" };
  }

  const [profile] = await deps.db
    .insert(parentProfiles)
    .values({
      authProvider: identity.provider,
      authSubject: identity.subject,
      email: identity.email,
      role: identity.role,
    })
    .onConflictDoUpdate({
      target: [parentProfiles.authProvider, parentProfiles.authSubject],
      set: { email: identity.email, role: identity.role, updatedAt: new Date() },
    })
    .returning();
  if (!profile) {
    throw new Error("Parent profile was not stored.");
  }

  await recordAuditEvent(deps.db, {
    action: "auth.signed_in",
    entityType: "parent_profile",
    entityId: profile.id,
    actorProfileId: profile.id,
    metadata: { provider: identity.provider, role: profile.role },
    requestId: input.requestId ?? null,
  });

  const sessionToken = await deps.auth.issueSession(profile.id, input.now);
  return { ok: true, profile, sessionToken };
}

/** Signs in and sets the session cookie (HTTP-only, SameSite=Lax, Secure in production). */
export async function signInWithEmail(email: string): Promise<{ ok: boolean }> {
  const result = await signIn(
    { db: await getReadyDb(), auth: getAuthService() },
    { email, requestId: await getRequestId() },
  );
  if (!result.ok) {
    return { ok: false };
  }
  (await cookies()).set(SESSION_COOKIE_NAME, result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return { ok: true };
}
