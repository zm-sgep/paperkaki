import { timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { env } from "@/config/env";
import type { Database } from "@/repositories/postgres/client";
import { getReadyDb } from "@/repositories/postgres/ready";
import { childDevices, children } from "@/repositories/postgres/schema";
import {
  CHILD_SESSION_COOKIE_NAME,
  hashDeviceKey,
  verifyChildSessionToken,
} from "@/services/auth/child-session-token";

/**
 * The child's session (ARCHITECTURE section 13). A child is a constrained session under the parent
 * account: it can reach the child screens and that one child's attempts, and nothing else.
 */
export type CurrentChild = {
  childId: string;
  nickname: string;
  deviceId: string;
  /** The parent who owns the child. Used for ownership checks, never shown. */
  parentProfileId: string;
};

const TOUCH_AFTER_MS = 5 * 60_000;

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks a cookie value against the database: the signature, the expiry, that the device row still
 * exists (removing it ends the session) and that the key matches its stored hash.
 */
export async function resolveChildSession(
  db: Database,
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<CurrentChild | null> {
  const session = await verifyChildSessionToken(env.AUTH_SECRET, token, now);
  if (!session) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.deviceId)) return null;

  const [row] = await db
    .select({
      deviceId: childDevices.id,
      tokenHash: childDevices.tokenHash,
      revokedAt: childDevices.revokedAt,
      lastSeenAt: childDevices.lastSeenAt,
      parentProfileId: childDevices.parentProfileId,
      childId: children.id,
      nickname: children.nickname,
      archivedAt: children.archivedAt,
    })
    .from(childDevices)
    .innerJoin(children, eq(children.id, childDevices.childId))
    .where(eq(childDevices.id, session.deviceId))
    .limit(1);
  if (!row || row.revokedAt || row.archivedAt) return null;
  if (!sameHash(row.tokenHash, await hashDeviceKey(session.deviceKey))) return null;

  // "Last used" for the parent's device list, without a write on every request.
  if (!row.lastSeenAt || now.getTime() - row.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    await db
      .update(childDevices)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(childDevices.id, row.deviceId),
          or(isNull(childDevices.lastSeenAt), lt(childDevices.lastSeenAt, new Date(now.getTime() - TOUCH_AFTER_MS))),
        ),
      );
  }
  return { childId: row.childId, nickname: row.nickname, deviceId: row.deviceId, parentProfileId: row.parentProfileId };
}

/** The child using this browser, or null. Cached per request. */
export const getCurrentChild = cache(async (): Promise<CurrentChild | null> => {
  const token = (await cookies()).get(CHILD_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return resolveChildSession(await getReadyDb(), token);
});

/** Returns the child or sends this browser to the "Enter the code" screen. Call it in every child layout, page and action. */
export async function requireChild(): Promise<CurrentChild> {
  const child = await getCurrentChild();
  if (!child) redirect("/child");
  return child;
}
