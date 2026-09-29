import { ForbiddenError } from "./errors";
import { getStorage, type StorageBucket, type StorageService } from "@/services/storage";

export type FileActor = { parentProfileId: string; role: "parent" | "admin" };

export type FileRef = {
  bucket: StorageBucket;
  key: string;
  /** The parent profile that owns the file, read from the database row that stores bucket and key. */
  ownerParentProfileId: string;
};

const DEFAULT_EXPIRES_IN_SECONDS = 300;

/**
 * The only way to get a link to a stored file. The owner and admins may have one; everyone
 * else gets ForbiddenError. Links last five minutes by default and never more than ten.
 * Database rows keep bucket and key, never the link.
 */
export async function issueFileUrl(
  actor: FileActor,
  file: FileRef,
  options: { storage?: StorageService; expiresInSeconds?: number } = {},
): Promise<string> {
  if (actor.role !== "admin" && actor.parentProfileId !== file.ownerParentProfileId) {
    throw new ForbiddenError();
  }
  const storage = options.storage ?? getStorage();
  return storage.createSignedUrl({
    bucket: file.bucket,
    key: file.key,
    expiresInSeconds: options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS,
  });
}
