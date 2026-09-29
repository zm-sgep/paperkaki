/**
 * Private object storage (ADR-0005). Objects are never public. Rows in the database store the
 * bucket and key, never a URL; a short-lived signed URL is created on request after the
 * application has checked who may see the file (see src/application/files.ts).
 */

export const STORAGE_BUCKETS = [
  "paper-pdfs",
  "question-assets",
  "assessment-source-uploads",
  "submission-uploads",
] as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

export const MAX_SIGNED_URL_SECONDS = 600;

export type ObjectRef = { bucket: StorageBucket; key: string };

export type StoredObject = { body: Uint8Array; contentType: string };

export interface StorageService {
  put(input: ObjectRef & { body: Uint8Array | string; contentType: string }): Promise<void>;
  /** Returns null when the object does not exist. */
  get(input: ObjectRef): Promise<StoredObject | null>;
  exists(input: ObjectRef): Promise<boolean>;
  /**
   * A time-limited path, `/api/files/{bucket}/{key}?exp=...&sig=...`, that serves the object.
   * `expiresInSeconds` must be a whole number from 1 to 600. Only src/application/files.ts
   * calls this, after an ownership check.
   */
  createSignedUrl(input: ObjectRef & { expiresInSeconds: number }): Promise<string>;
}

/** The bucket or key is not acceptable. The message never includes the rejected value. */
export class StorageKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageKeyError";
  }
}

export function isStorageBucket(value: string): value is StorageBucket {
  return (STORAGE_BUCKETS as readonly string[]).includes(value);
}

const MAX_KEY_LENGTH = 512;

/**
 * Keys are relative, forward-slash paths such as `family-id/paper-id.pdf`. Rejects anything
 * that could climb out of the bucket or be read differently by different systems: `..` anywhere,
 * absolute paths, backslashes, empty or `.` segments, control characters.
 */
export function assertValidKey(key: string): void {
  if (key === "" || key.length > MAX_KEY_LENGTH) {
    throw new StorageKeyError(`Storage key must be 1 to ${MAX_KEY_LENGTH} characters.`);
  }
  if (key.includes("..")) {
    throw new StorageKeyError("Storage key must not contain '..'.");
  }
  if (key.startsWith("/")) {
    throw new StorageKeyError("Storage key must be relative, not absolute.");
  }
  if (key.includes("\\")) {
    throw new StorageKeyError("Storage key must not contain backslashes.");
  }
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    throw new StorageKeyError("Storage key must not contain control characters.");
  }
  if (key.split("/").some((segment) => segment === "" || segment === ".")) {
    throw new StorageKeyError("Storage key must not contain empty or '.' segments.");
  }
}

export function assertValidBucket(bucket: string): asserts bucket is StorageBucket {
  if (!isStorageBucket(bucket)) {
    throw new StorageKeyError("Unknown storage bucket.");
  }
}
