import { createHmac, randomInt } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { env } from "@/config/env";
import { NotFoundError } from "@/application/errors";
import {
  PAIRING_CODE_LENGTH,
  PAIRING_MAX_WRONG_TRIES,
  normalisePairingCode,
  pairingCodeExpiry,
} from "@/domain/attempts";
import { recordAuditEvent } from "@/lib/audit";
import type { Database } from "@/repositories/postgres/client";
import { getOwnedChild } from "@/repositories/postgres/assessments";
import { childDevices, childPairingCodes, children } from "@/repositories/postgres/schema";
import { hashDeviceKey, newDeviceKey, signChildSessionToken } from "@/services/auth/child-session-token";
import { resolveCommandDb, type CommandContext } from "./children";

/**
 * Setting up a child's device (ARCHITECTURE section 13). Two ways in, both started by the parent:
 *   - a six-digit code that the child types on their own device (`createPairingCode` then `pairDevice`);
 *   - "Hand this device to Darius" on the parent's current browser (`handDeviceToChild`).
 * Either ends in a `child_devices` row and a signed session value for the cookie. Everything a
 * parent does is scoped to that parent's own children; anything else is "not found".
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CODE_ATTEMPT_MESSAGE = "That code didn't work. Check the numbers, or ask a grown-up for a new code.";

function hashCode(code: string): string {
  return createHmac("sha256", `${env.AUTH_SECRET}:pairing-code`).update(code).digest("hex");
}

function randomCode(): string {
  return String(randomInt(0, 10 ** PAIRING_CODE_LENGTH)).padStart(PAIRING_CODE_LENGTH, "0");
}

async function ownedActiveChild(db: Database, parentProfileId: string, childId: string) {
  const child = await getOwnedChild(db, parentProfileId, childId);
  if (!child || child.archivedAt) throw new NotFoundError();
  return child;
}

export type PairingCode = { code: string; expiresAt: Date };

/**
 * A fresh code for one of the parent's children. Earlier unused codes for that child stop working,
 * so there is only ever one code to read out. The code is returned once; only its hash is kept.
 */
export async function createPairingCode(
  parentProfileId: string,
  childId: string,
  context: CommandContext = {},
): Promise<PairingCode> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  await ownedActiveChild(db, parentProfileId, childId);

  return db.transaction(async (tx) => {
    await tx.delete(childPairingCodes).where(and(eq(childPairingCodes.childId, childId), isNull(childPairingCodes.usedAt)));
    // Old spent or expired rows are tidied away too, so the table does not grow without end.
    await tx.delete(childPairingCodes).where(lt(childPairingCodes.expiresAt, new Date(now.getTime() - 24 * 3_600_000)));

    // Two live codes must never be the same, or a child could join the wrong profile.
    let code = randomCode();
    for (let tries = 0; tries < 20; tries += 1) {
      const clash = await tx
        .select({ id: childPairingCodes.id })
        .from(childPairingCodes)
        .where(
          and(
            eq(childPairingCodes.codeHash, hashCode(code)),
            isNull(childPairingCodes.usedAt),
            gt(childPairingCodes.expiresAt, now),
          ),
        )
        .limit(1);
      if (clash.length === 0) break;
      code = randomCode();
    }

    const expiresAt = pairingCodeExpiry(now);
    const [row] = await tx
      .insert(childPairingCodes)
      .values({ childId, parentProfileId, codeHash: hashCode(code), expiresAt })
      .returning({ id: childPairingCodes.id });
    await recordAuditEvent(tx, {
      action: "child_device.code_created",
      entityType: "child",
      entityId: childId,
      actorProfileId: parentProfileId,
      metadata: { codeId: row?.id ?? null },
      requestId: context.requestId ?? null,
    });
    return { code, expiresAt };
  });
}

export type ChildDeviceSession = {
  deviceId: string;
  childId: string;
  /** The signed value for the child cookie. */
  sessionToken: string;
};

async function createDevice(
  db: Database,
  input: { childId: string; parentProfileId: string; label: string; now: Date },
): Promise<ChildDeviceSession> {
  const deviceKey = newDeviceKey();
  const [device] = await db
    .insert(childDevices)
    .values({
      childId: input.childId,
      parentProfileId: input.parentProfileId,
      label: input.label,
      tokenHash: await hashDeviceKey(deviceKey),
      lastSeenAt: input.now,
    })
    .returning({ id: childDevices.id });
  if (!device) throw new Error("Child device was not stored.");
  const sessionToken = await signChildSessionToken(env.AUTH_SECRET, { deviceId: device.id, deviceKey }, input.now);
  return { deviceId: device.id, childId: input.childId, sessionToken };
}

export type PairResult = ({ ok: true } & ChildDeviceSession) | { ok: false; reason: "invalid" };

/**
 * Turns a code typed on the child's device into a session. One message for every failure (wrong,
 * spent, expired, locked), so nobody learns which codes exist. A wrong try counts against every live
 * code, because a wrong try cannot say which code it was meant for; the fifth wrong try locks them.
 */
export async function pairDevice(rawCode: string, context: CommandContext = {}): Promise<PairResult> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  const code = normalisePairingCode(rawCode);

  return db.transaction(async (tx): Promise<PairResult> => {
    const live = and(isNull(childPairingCodes.usedAt), gt(childPairingCodes.expiresAt, now), lt(childPairingCodes.wrongTries, PAIRING_MAX_WRONG_TRIES));

    if (code) {
      // Spending the code is the guard against two children using it at once: only one update can win.
      const [spent] = await tx
        .update(childPairingCodes)
        .set({ usedAt: now })
        .where(and(eq(childPairingCodes.codeHash, hashCode(code)), live))
        .returning();
      if (spent) {
        const [child] = await tx.select().from(children).where(eq(children.id, spent.childId)).limit(1);
        if (child && !child.archivedAt) {
          const session = await createDevice(tx, {
            childId: child.id,
            parentProfileId: spent.parentProfileId,
            label: `${child.nickname}'s iPad`,
            now,
          });
          await recordAuditEvent(tx, {
            action: "child_device.paired",
            entityType: "child_device",
            entityId: session.deviceId,
            actorProfileId: spent.parentProfileId,
            metadata: { childId: child.id, how: "code" },
            requestId: context.requestId ?? null,
          });
          return { ok: true, ...session };
        }
        return { ok: false, reason: "invalid" };
      }
    }

    await tx
      .update(childPairingCodes)
      .set({ wrongTries: sql`${childPairingCodes.wrongTries} + 1` })
      .where(live);
    return { ok: false, reason: "invalid" };
  });
}

/** "Hand this device to Darius": a session for the browser the parent is on now. */
export async function handDeviceToChild(
  parentProfileId: string,
  childId: string,
  context: CommandContext = {},
): Promise<ChildDeviceSession> {
  const db = await resolveCommandDb(context);
  const now = context.now ?? new Date();
  await ownedActiveChild(db, parentProfileId, childId);
  return db.transaction(async (tx) => {
    const session = await createDevice(tx, { childId, parentProfileId, label: "Handed-over device", now });
    await recordAuditEvent(tx, {
      action: "child_device.paired",
      entityType: "child_device",
      entityId: session.deviceId,
      actorProfileId: parentProfileId,
      metadata: { childId, how: "hand_over" },
      requestId: context.requestId ?? null,
    });
    return session;
  });
}

/** "Remove": the device's session ends at once. Only the parent who set it up can remove it. */
export async function removeChildDevice(parentProfileId: string, deviceId: string, context: CommandContext = {}): Promise<void> {
  if (!UUID.test(deviceId)) throw new NotFoundError();
  const db = await resolveCommandDb(context);
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(childDevices)
      .where(and(eq(childDevices.id, deviceId), eq(childDevices.parentProfileId, parentProfileId)))
      .returning({ id: childDevices.id, childId: childDevices.childId });
    const row = removed[0];
    if (!row) throw new NotFoundError();
    await recordAuditEvent(tx, {
      action: "child_device.removed",
      entityType: "child_device",
      entityId: row.id,
      actorProfileId: parentProfileId,
      metadata: { childId: row.childId },
      requestId: context.requestId ?? null,
    });
  });
}
