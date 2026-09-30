/**
 * The child device session (ARCHITECTURE section 13: child mode is a constrained session under the
 * parent account). A signed cookie names one row in `child_devices` and carries a random device key
 * whose SHA-256 hash is stored in that row, so a copy of the database cannot mint a cookie, and
 * deleting the row ends the session.
 *
 * Signed with a secret derived from AUTH_SECRET, so a parent session cookie is never accepted as a
 * child one (and the payload has no `sub`, so the reverse fails too). Web Crypto only: the proxy
 * and Node run the same code.
 */

import { toBase64Url } from "@/lib/base64url";
import { signPayload, verifyPayload } from "./session-token";

export const CHILD_SESSION_COOKIE_NAME = "pk_child";
export const CHILD_SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

type Payload = {
  /** Device id. */
  dev: string;
  /** Random device key; only its hash is stored. */
  key: string;
  iat: number;
  exp: number;
};

const childSecret = (secret: string): string => `${secret}:child-device-session`;

/** A fresh random key for a new device. */
export function newDeviceKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Lower-case hex SHA-256 of a device key: what the database stores. */
export async function hashDeviceKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signChildSessionToken(
  secret: string,
  device: { deviceId: string; deviceKey: string },
  now: Date = new Date(),
  maxAgeSeconds: number = CHILD_SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: Payload = { dev: device.deviceId, key: device.deviceKey, iat: issuedAt, exp: issuedAt + maxAgeSeconds };
  return signPayload(childSecret(secret), payload);
}

export type VerifiedChildSession = { deviceId: string; deviceKey: string; issuedAt: Date; expiresAt: Date };

/** Signature and expiry only. The caller still checks that the device row exists and matches the key. */
export async function verifyChildSessionToken(
  secret: string,
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<VerifiedChildSession | null> {
  const payload = (await verifyPayload(childSecret(secret), token)) as Partial<Payload> | null;
  if (!payload) return null;
  if (
    typeof payload.dev !== "string" ||
    typeof payload.key !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.dev === "" ||
    payload.key === ""
  ) {
    return null;
  }
  if (Math.floor(now.getTime() / 1000) >= payload.exp) return null;
  return {
    deviceId: payload.dev,
    deviceKey: payload.key,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: new Date(payload.exp * 1000),
  };
}
