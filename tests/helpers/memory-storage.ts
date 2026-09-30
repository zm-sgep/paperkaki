import type { ObjectRef, StorageService, StoredObject } from "@/services/storage";

/** An in-memory StorageService for integration tests: no files, no signing secret needed. */
export type MemoryStorage = StorageService & { objects: Map<string, StoredObject>; failNextPut: () => void };

const keyOf = ({ bucket, key }: ObjectRef): string => `${bucket}/${key}`;

export function createMemoryStorage(): MemoryStorage {
  const objects = new Map<string, StoredObject>();
  let failPut = false;
  return {
    objects,
    failNextPut() {
      failPut = true;
    },
    async put({ bucket, key, body, contentType }) {
      if (failPut) {
        failPut = false;
        throw new Error("storage is unavailable (test)");
      }
      objects.set(keyOf({ bucket, key }), {
        body: typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body),
        contentType,
      });
    },
    async get(ref) {
      return objects.get(keyOf(ref)) ?? null;
    },
    async exists(ref) {
      return objects.has(keyOf(ref));
    },
    async delete(ref) {
      objects.delete(keyOf(ref));
    },
    async createSignedUrl({ bucket, key, expiresInSeconds }) {
      return `/api/files/${bucket}/${key}?exp=${expiresInSeconds}&sig=test`;
    },
  };
}
