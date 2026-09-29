import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { parentProfiles } from "@/repositories/postgres/schema";
import { getReadyDb } from "@/repositories/postgres/ready";
import { SESSION_COOKIE_NAME, getAuthService, type AuthRole } from "@/services/auth";

export type CurrentParent = {
  parentProfileId: string;
  role: AuthRole;
  displayName: string;
  email: string;
};

function displayNameFor(profile: { displayName: string | null; email: string }): string {
  return profile.displayName?.trim() || profile.email.split("@")[0] || profile.email;
}

/**
 * The signed-in parent, or null. Verifies the session cookie signature and expiry and loads
 * the profile from the database, so a deleted profile or a forged cookie never passes.
 * Cached per request. The proxy check is only a fast redirect; this is the real guard.
 */
export const getCurrentParent = cache(async (): Promise<CurrentParent | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await getAuthService().readSession(token);
  if (!session) {
    return null;
  }
  const [profile] = await (await getReadyDb())
    .select()
    .from(parentProfiles)
    .where(eq(parentProfiles.id, session.parentProfileId))
    .limit(1);
  if (!profile) {
    return null;
  }
  return {
    parentProfileId: profile.id,
    role: profile.role,
    displayName: displayNameFor(profile),
    email: profile.email,
  };
});

/** Returns the signed-in parent or redirects to /sign-in. Call it in every protected layout, page and action. */
export async function requireParent(): Promise<CurrentParent> {
  const parent = await getCurrentParent();
  if (!parent) {
    redirect("/sign-in");
  }
  return parent;
}

/** Returns the signed-in admin. Anyone else gets a 404, so the admin area is not advertised. */
export async function requireAdmin(): Promise<CurrentParent> {
  const parent = await requireParent();
  if (parent.role !== "admin") {
    notFound();
  }
  return parent;
}
