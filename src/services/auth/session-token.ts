/**
 * Signed session tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Uses Web Crypto only, so the same code runs in the proxy and in Node.
 */

import { fromBase64Url, toBase64Url } from "@/lib/base64url";

export const SESSION_COOKIE_NAME = "pk_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type Payload = {
  /** Parent profile id. */
  sub: string;
  /** Issued at, seconds since the epoch. */
  iat: number;
  /** Expires at, seconds since the epoch. */
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** Signs any JSON payload: base64url(payload) + "." + base64url(HMAC-SHA256). */
export async function signPayload(secret: string, payload: Record<string, unknown>): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Constant-time signature check (crypto.subtle.verify). Returns the payload object, or null when the
 * token is malformed or was not signed with this secret. Expiry is the caller's to check.
 */
export async function verifyPayload(secret: string, token: string | undefined | null): Promise<Record<string, unknown> | null> {
  if (!token || token.length > 1024) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [body, signature] = parts as [string, string];
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) {
    return null;
  }

  let valid = false;
  try {
    valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signatureBytes, encoder.encode(body));
  } catch {
    return null;
  }
  if (!valid) {
    return null;
  }

  const bodyBytes = fromBase64Url(body);
  if (!bodyBytes) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(decoder.decode(bodyBytes));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function signSessionToken(
  secret: string,
  parentProfileId: string,
  now: Date = new Date(),
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: Payload = { sub: parentProfileId, iat: issuedAt, exp: issuedAt + maxAgeSeconds };
  return signPayload(secret, payload);
}

export type VerifiedSession = { parentProfileId: string; issuedAt: Date; expiresAt: Date };

/** Signature check, then expiry. Returns null on any failure. */
export async function verifySessionToken(
  secret: string,
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<VerifiedSession | null> {
  const payload = (await verifyPayload(secret, token)) as Partial<Payload> | null;
  if (!payload) {
    return null;
  }
  if (
    typeof payload.sub !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.sub === ""
  ) {
    return null;
  }
  if (Math.floor(now.getTime() / 1000) >= payload.exp) {
    return null;
  }
  return {
    parentProfileId: payload.sub,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: new Date(payload.exp * 1000),
  };
}
