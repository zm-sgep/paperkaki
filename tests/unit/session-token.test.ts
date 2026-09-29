import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SECONDS, signSessionToken, verifySessionToken } from "@/services/auth/session-token";

const secret = "unit-test-secret-that-is-at-least-32-chars";
const profileId = "00000000-0000-4000-8000-000000000041";
const issuedAt = new Date("2026-09-29T00:00:00Z");

describe("session token", () => {
  it("round-trips the profile id with a 30 day expiry", async () => {
    const token = await signSessionToken(secret, profileId, issuedAt);
    const session = await verifySessionToken(secret, token, new Date("2026-10-01T00:00:00Z"));
    expect(session?.parentProfileId).toBe(profileId);
    expect(session?.issuedAt).toEqual(issuedAt);
    expect((session?.expiresAt.getTime() ?? 0) - issuedAt.getTime()).toBe(SESSION_MAX_AGE_SECONDS * 1000);
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("rejects an expired token", async () => {
    const token = await signSessionToken(secret, profileId, issuedAt);
    const justBefore = new Date(issuedAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000 - 1000);
    const atExpiry = new Date(issuedAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
    expect(await verifySessionToken(secret, token, justBefore)).not.toBeNull();
    expect(await verifySessionToken(secret, token, atExpiry)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken("another-secret-that-is-also-32-characters", profileId, issuedAt);
    expect(await verifySessionToken(secret, token, issuedAt)).toBeNull();
  });

  it("rejects a token whose payload was changed", async () => {
    const token = await signSessionToken(secret, profileId, issuedAt);
    const [, signature] = token.split(".") as [string, string];
    const forgedPayload = btoa(
      JSON.stringify({ sub: "00000000-0000-4000-8000-000000000099", iat: 1, exp: 9_999_999_999 }),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    expect(await verifySessionToken(secret, `${forgedPayload}.${signature}`, issuedAt)).toBeNull();
  });

  it("rejects missing, empty, malformed and oversized values without throwing", async () => {
    for (const value of [undefined, null, "", "abc", "a.b.c", ".", "not base64!.also not", "x".repeat(2000)]) {
      expect(await verifySessionToken(secret, value, issuedAt)).toBeNull();
    }
  });
});
