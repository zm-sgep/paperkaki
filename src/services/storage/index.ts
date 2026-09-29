import { env } from "@/config/env";
import { createLocalStorage } from "./local-adapter";
import type { StorageService } from "./types";

export * from "./types";
export { verifySignedFileRequest } from "./signing";

const globalForStorage = globalThis as unknown as { __paperkakiStorage?: StorageService };

/** The storage adapter for this deployment. Only the local adapter exists so far. */
export function getStorage(): StorageService {
  globalForStorage.__paperkakiStorage ??= createLocalStorage({
    rootDir: env.STORAGE_LOCAL_DIR,
    signingSecret: env.STORAGE_SIGNING_SECRET,
  });
  return globalForStorage.__paperkakiStorage;
}
