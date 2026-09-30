import { describe, expect, it } from "vitest";
import {
  CHILD_SESSION_MAX_AGE_SECONDS,
  hashDeviceKey,
  newDeviceKey,
  signChildSessionToken,
  verifyChildSessionToken,
} from "@/services/auth/child-session-token";
import { signSessionToken, verifySessionToken } from "@/services/auth/session-token";

const secret = "unit-test-secret-that-is-at-least-32-chars";
const deviceId = "00000000-0000-4000-8000-0000000000d1";
const issuedAt = new Date("2026-09-29T00:00:00Z");

describe("child device session token", () => {
  it("round-trips the device id and key with a 180 day expiry", async () => {
    const key = newDeviceKey();
    const token = await signChildSessionToken(secret, { deviceId, deviceKey: key }, issuedAt);
    const session = await verifyChildSessionToken(secret, token, new Date("2026-12-01T00:00:00Z"));
    expect(session).toMatchObject({ deviceId, deviceKey: key });
    expect((session?.expiresAt.getTime() ?? 0) - issuedAt.getTime()).toBe(CHILD_SESSION_MAX_AGE_SECONDS * 1000);
    expect(CHILD_SESSION_MAX_AGE_SECONDS).toBe(180 * 24 * 60 * 60);
  });

  it("expires after 180 days", async () => {
    const token = await signChildSessionToken(secret, { deviceId, deviceKey: "k" }, issuedAt);
    const justBefore = new Date(issuedAt.getTime() + CHILD_SESSION_MAX_AGE_SECONDS * 1000 - 1000);
    const atExpiry = new Date(issuedAt.getTime() + CHILD_SESSION_MAX_AGE_SECONDS * 1000);
    expect(await verifyChildSessionToken(secret, token, justBefore)).not.toBeNull();
    expect(await verifyChildSessionToken(secret, token, atExpiry)).toBeNull();
  });

  it("rejects a token signed with another secret, a tampered payload and junk", async () => {
    const token = await signChildSessionToken(secret, { deviceId, deviceKey: "k" }, issuedAt);
    expect(await verifyChildSessionToken("another-secret-that-is-also-32-characters", token, issuedAt)).toBeNull();
    const [body, signature] = token.split(".") as [string, string];
    const forged = `${Buffer.from(JSON.stringify({ dev: "someone-else", key: "k", iat: 1, exp: 9_999_999_999 })).toString("base64url")}.${signature}`;
    expect(await verifyChildSessionToken(secret, forged, issuedAt)).toBeNull();
    expect(await verifyChildSessionToken(secret, `${body}.`, issuedAt)).toBeNull();
    expect(await verifyChildSessionToken(secret, "nonsense", issuedAt)).toBeNull();
    expect(await verifyChildSessionToken(secret, undefined, issuedAt)).toBeNull();
  });

  it("is not interchangeable with a parent session cookie", async () => {
    const parentToken = await signSessionToken(secret, deviceId, issuedAt);
    const childToken = await signChildSessionToken(secret, { deviceId, deviceKey: "k" }, issuedAt);
    expect(await verifyChildSessionToken(secret, parentToken, issuedAt)).toBeNull();
    expect(await verifySessionToken(secret, childToken, issuedAt)).toBeNull();
  });

  it("stores only a 64-character hash of the device key", async () => {
    const key = newDeviceKey();
    const hash = await hashDeviceKey(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key);
    expect(await hashDeviceKey(key)).toBe(hash);
    expect(await hashDeviceKey(newDeviceKey())).not.toBe(hash);
  });
});
