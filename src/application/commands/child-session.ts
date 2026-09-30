import { cookies } from "next/headers";
import { CHILD_SESSION_COOKIE_NAME, CHILD_SESSION_MAX_AGE_SECONDS } from "@/services/auth/child-session-token";
import { SESSION_COOKIE_NAME } from "@/services/auth";

/**
 * Switches this browser into child mode: sets the child cookie and clears the parent cookie, so a
 * browser is a parent's or a child's, never both (a child cannot reach parent screens by
 * accident, and shared paths such as /progress mean one thing at a time).
 */
export async function startChildSession(sessionToken: string): Promise<void> {
  const store = await cookies();
  store.set(CHILD_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHILD_SESSION_MAX_AGE_SECONDS,
  });
  store.delete(SESSION_COOKIE_NAME);
}
