// The storage folder is chosen at runtime (STORAGE_LOCAL_DIR); the comments below stop the
// bundler from tracing the whole project into the server output for these dynamic paths.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSignedFileUrl } from "./signing";
import {
  assertValidBucket,
  assertValidKey,
  type ObjectRef,
  type StorageService,
  type StoredObject,
} from "./types";

/**
 * Stores objects as files under `rootDir/{bucket}/{key}`, with the content type in a small
 * sidecar under `rootDir/.meta/{bucket}/{key}.json`. For local development and tests; a cloud
 * adapter replaces it behind the same interface.
 */
export function createLocalStorage(options: {
  rootDir: string;
  signingSecret: string;
  now?: () => Date;
}): StorageService {
  const root = path.resolve(options.rootDir);
  const now = options.now ?? (() => new Date());

  function locate(ref: ObjectRef): { file: string; meta: string } {
    assertValidBucket(ref.bucket);
    assertValidKey(ref.key);
    const file = path.resolve(root, ref.bucket, ...ref.key.split("/"));
    const meta = path.resolve(root, ".meta", ref.bucket, ...ref.key.split("/")) + ".json";
    // Belt and braces: assertValidKey already rules out traversal.
    const bucketDir = path.resolve(root, ref.bucket) + path.sep;
    if (!file.startsWith(bucketDir)) {
      throw new Error("Resolved storage path escaped its bucket.");
    }
    return { file, meta };
  }

  return {
    async put({ bucket, key, body, contentType }) {
      const { file, meta } = locate({ bucket, key });
      await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
      await mkdir(/*turbopackIgnore: true*/ path.dirname(meta), { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ file, body);
      await writeFile(/*turbopackIgnore: true*/ meta, JSON.stringify({ contentType }));
    },

    async get(ref): Promise<StoredObject | null> {
      const { file, meta } = locate(ref);
      try {
        const body = new Uint8Array(await readFile(/*turbopackIgnore: true*/ file));
        let contentType = "application/octet-stream";
        try {
          const parsed: unknown = JSON.parse(await readFile(/*turbopackIgnore: true*/ meta, "utf8"));
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "contentType" in parsed &&
            typeof parsed.contentType === "string"
          ) {
            contentType = parsed.contentType;
          }
        } catch {
          // Missing or unreadable sidecar: serve as opaque bytes.
        }
        return { body, contentType };
      } catch (error) {
        if (isMissing(error)) {
          return null;
        }
        throw error;
      }
    },

    async exists(ref) {
      const { file } = locate(ref);
      try {
        return (await stat(/*turbopackIgnore: true*/ file)).isFile();
      } catch (error) {
        if (isMissing(error)) {
          return false;
        }
        throw error;
      }
    },

    createSignedUrl(input) {
      return createSignedFileUrl(options.signingSecret, input, now());
    },
  };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
