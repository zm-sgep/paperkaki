import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { archiveChild, createChild } from "@/application/commands/children";
import {
  createPairingCode,
  handDeviceToChild,
  pairDevice,
  removeChildDevice,
} from "@/application/commands/child-devices";
import { NotFoundError } from "@/application/errors";
import { listChildDevices } from "@/application/queries/children";
import { resolveChildSession } from "@/application/queries/current-child";
import { PAIRING_MAX_WRONG_TRIES } from "@/domain/attempts";
import type { Database } from "@/repositories/postgres/client";
import { childDevices, childPairingCodes } from "@/repositories/postgres/schema";
import { insertParentProfile } from "../factories";
import { NOW } from "../helpers/assessment-fixtures";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

describe("child devices (pairing code and hand-over)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let parentA: string;
  let parentB: string;
  let darius: string;
  let otherChild: string;

  const ctx = (now: Date = NOW) => ({ db, now });

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    parentA = (await insertParentProfile(db, "A")).id;
    parentB = (await insertParentProfile(db, "B")).id;
    darius = (await createChild(parentA, { nickname: "Darius" }, ctx())).id;
    otherChild = (await createChild(parentB, { nickname: "Test Child B" }, ctx())).id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("pairs a device with a code: one session for that child, and the code is spent", async () => {
    const { code } = await createPairingCode(parentA, darius, ctx());
    expect(code).toMatch(/^\d{6}$/);

    const paired = await pairDevice(code, ctx());
    expect(paired.ok).toBe(true);
    if (!paired.ok) return;
    expect(paired.childId).toBe(darius);

    const session = await resolveChildSession(db, paired.sessionToken, NOW);
    expect(session).toMatchObject({ childId: darius, nickname: "Darius", parentProfileId: parentA });

    // Only a hash of the device key is stored, never the cookie value.
    const [device] = await db.select().from(childDevices).where(eq(childDevices.id, paired.deviceId));
    expect(device).toMatchObject({ childId: darius, parentProfileId: parentA, label: "Darius's iPad" });
    expect(device?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(paired.sessionToken).not.toContain(device?.tokenHash ?? "x");

    // Single use.
    expect(await pairDevice(code, ctx())).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts the code with spaces, and refuses it after ten minutes", async () => {
    const { code } = await createPairingCode(parentA, darius, ctx());
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    const late = new Date(NOW.getTime() + 10 * 60_000);
    expect(await pairDevice(spaced, ctx(late))).toEqual({ ok: false, reason: "invalid" });

    const fresh = await createPairingCode(parentA, darius, ctx());
    const justInTime = new Date(NOW.getTime() + 9 * 60_000 + 59_000);
    expect((await pairDevice(fresh.code, ctx(justInTime))).ok).toBe(true);
  });

  it("makes a new code replace the old one", async () => {
    const first = await createPairingCode(parentA, darius, ctx());
    const second = await createPairingCode(parentA, darius, ctx());
    expect((await pairDevice(first.code, ctx())).ok).toBe(first.code === second.code);
    if (first.code !== second.code) expect((await pairDevice(second.code, ctx())).ok).toBe(true);
  });

  it("locks live codes after five wrong tries, even for the right code", async () => {
    const { code } = await createPairingCode(parentA, darius, ctx());
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < PAIRING_MAX_WRONG_TRIES; i += 1) {
      expect(await pairDevice(wrong, ctx())).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await pairDevice(code, ctx())).toEqual({ ok: false, reason: "invalid" });

    const rows = await db.select().from(childPairingCodes).where(eq(childPairingCodes.childId, darius));
    expect(rows.every((row) => row.wrongTries <= PAIRING_MAX_WRONG_TRIES)).toBe(true);
  });

  it("survives four wrong tries", async () => {
    const { code } = await createPairingCode(parentA, darius, ctx());
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < PAIRING_MAX_WRONG_TRIES - 1; i += 1) await pairDevice(wrong, ctx());
    expect((await pairDevice(code, ctx())).ok).toBe(true);
  });

  it("refuses junk input without touching anything but the counters", async () => {
    expect(await pairDevice("", ctx())).toEqual({ ok: false, reason: "invalid" });
    expect(await pairDevice("abcdef", ctx())).toEqual({ ok: false, reason: "invalid" });
  });

  it("only creates codes and hand-overs for a parent's own, active children", async () => {
    await expect(createPairingCode(parentA, otherChild, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(handDeviceToChild(parentA, otherChild, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(createPairingCode(parentA, "not-a-uuid", ctx())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("hands a device over: a session for that child, listed for the parent", async () => {
    const session = await handDeviceToChild(parentA, darius, ctx());
    expect(await resolveChildSession(db, session.sessionToken, NOW)).toMatchObject({ childId: darius });
    const devices = await listChildDevices(parentA, { db });
    expect(devices.some((device) => device.id === session.deviceId && device.label === "Handed-over device")).toBe(true);
    expect(await listChildDevices(parentB, { db })).toEqual([]);
  });

  it("ends a session the moment its device is removed, and only the owner can remove it", async () => {
    const session = await handDeviceToChild(parentA, darius, ctx());
    await expect(removeChildDevice(parentB, session.deviceId, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeChildDevice(parentA, "not-a-uuid", ctx())).rejects.toBeInstanceOf(NotFoundError);
    expect(await resolveChildSession(db, session.sessionToken, NOW)).not.toBeNull();

    await removeChildDevice(parentA, session.deviceId, ctx());
    expect(await resolveChildSession(db, session.sessionToken, NOW)).toBeNull();
  });

  it("does not accept a session after 180 days, a forged key or junk", async () => {
    const session = await handDeviceToChild(parentA, darius, ctx());
    const later = new Date(NOW.getTime() + 181 * 24 * 3_600_000);
    expect(await resolveChildSession(db, session.sessionToken, later)).toBeNull();
    expect(await resolveChildSession(db, "junk", NOW)).toBeNull();
    expect(await resolveChildSession(db, undefined, NOW)).toBeNull();

    // A device row whose hash no longer matches the cookie's key is refused.
    await db.update(childDevices).set({ tokenHash: "0".repeat(64) }).where(eq(childDevices.id, session.deviceId));
    expect(await resolveChildSession(db, session.sessionToken, NOW)).toBeNull();
  });

  it("ends the session when the child is archived", async () => {
    const archie = (await createChild(parentA, { nickname: "Archie" }, ctx())).id;
    const session = await handDeviceToChild(parentA, archie, ctx());
    expect(await resolveChildSession(db, session.sessionToken, NOW)).not.toBeNull();
    await archiveChild(parentA, archie, ctx());
    expect(await resolveChildSession(db, session.sessionToken, NOW)).toBeNull();
  });
});
