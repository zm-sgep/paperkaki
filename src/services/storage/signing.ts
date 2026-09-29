import { fromBase64Url, toBase64Url } from "@/lib/base64url";
import { MAX_SIGNED_URL_SECONDS, assertValidBucket, assertValidKey, type ObjectRef } from "./types";

/**
 * Signed file URLs: /api/files/{bucket}/{key}?exp={unix seconds}&sig={base64url HMAC-SHA256}.
 * The signature covers bucket, key and expiry, so none can be changed without invalidating it.
 * Web Crypto only; verification is constant-time (crypto.subtle.verify).
 */

const encoder = new TextEncoder();

function signedPayload(ref: ObjectRef, exp: number): Uint8Array<ArrayBuffer> {
  // Newlines cannot appear in a valid bucket or key, so the parts cannot run into each other.
  return encoder.encode(`${ref.bucket}\n${ref.key}\n${exp}`);
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signFileRequest(secret: string, ref: ObjectRef, exp: number): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), signedPayload(ref, exp));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSignedFileUrl(
  secret: string,
  ref: ObjectRef & { expiresInSeconds: number },
  now: Date = new Date(),
): Promise<string> {
  assertValidBucket(ref.bucket);
  assertValidKey(ref.key);
  if (
    !Number.isInteger(ref.expiresInSeconds) ||
    ref.expiresInSeconds < 1 ||
    ref.expiresInSeconds > MAX_SIGNED_URL_SECONDS
  ) {
    throw new RangeError(`expiresInSeconds must be a whole number from 1 to ${MAX_SIGNED_URL_SECONDS}.`);
  }
  const exp = Math.floor(now.getTime() / 1000) + ref.expiresInSeconds;
  const signature = await signFileRequest(secret, ref, exp);
  const path = ref.key.split("/").map(encodeURIComponent).join("/");
  return `/api/files/${ref.bucket}/${path}?exp=${exp}&sig=${signature}`;
}

/**
 * True only for a well-formed, unexpired request whose signature matches. Never says which
 * check failed.
 */
export async function verifySignedFileRequest(
  secret: string,
  request: { bucket: string; key: string; exp: string | null; sig: string | null },
  now: Date = new Date(),
): Promise<boolean> {
  try {
    assertValidBucket(request.bucket);
    assertValidKey(request.key);
    if (!request.exp || !/^\d{1,12}$/.test(request.exp) || !request.sig) {
      return false;
    }
    const exp = Number(request.exp);
    const signature = fromBase64Url(request.sig);
    if (!signature) {
      return false;
    }
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      signature,
      signedPayload({ bucket: request.bucket, key: request.key }, exp),
    );
    return valid && Math.floor(now.getTime() / 1000) < exp;
  } catch {
    return false;
  }
}
