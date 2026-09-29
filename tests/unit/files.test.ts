import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/application/errors";
import { issueFileUrl, type FileActor } from "@/application/files";
import type { StorageService } from "@/services/storage";

const owner: FileActor = { parentProfileId: "00000000-0000-4000-8000-000000000041", role: "parent" };
const otherParent: FileActor = { parentProfileId: "00000000-0000-4000-8000-000000000042", role: "parent" };
const admin: FileActor = { parentProfileId: "00000000-0000-4000-8000-000000000043", role: "admin" };
const file = { bucket: "paper-pdfs", key: "family/paper.pdf", ownerParentProfileId: owner.parentProfileId } as const;

function fakeStorage() {
  const calls: { bucket: string; key: string; expiresInSeconds: number }[] = [];
  const storage: StorageService = {
    put: async () => undefined,
    get: async () => null,
    exists: async () => false,
    createSignedUrl: async (input) => {
      calls.push({ bucket: input.bucket, key: input.key, expiresInSeconds: input.expiresInSeconds });
      return `/api/files/${input.bucket}/${input.key}?exp=1&sig=fake`;
    },
  };
  return { storage, calls };
}

describe("issueFileUrl", () => {
  it("gives the owner a short-lived link", async () => {
    const { storage, calls } = fakeStorage();
    await expect(issueFileUrl(owner, file, { storage })).resolves.toContain("/api/files/paper-pdfs/family/paper.pdf");
    expect(calls).toEqual([{ bucket: "paper-pdfs", key: "family/paper.pdf", expiresInSeconds: 300 }]);
  });

  it("refuses another parent and creates no link", async () => {
    const { storage, calls } = fakeStorage();
    await expect(issueFileUrl(otherParent, file, { storage })).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toHaveLength(0);
  });

  it("allows an admin", async () => {
    const { storage } = fakeStorage();
    await expect(issueFileUrl(admin, file, { storage })).resolves.toContain("/api/files/");
  });

  it("passes a shorter lifetime through", async () => {
    const { storage, calls } = fakeStorage();
    await issueFileUrl(owner, file, { storage, expiresInSeconds: 60 });
    expect(calls[0]?.expiresInSeconds).toBe(60);
  });
});
