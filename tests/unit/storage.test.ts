import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalStorage } from "@/services/storage/local-adapter";
import { createSignedFileUrl, verifySignedFileRequest } from "@/services/storage/signing";
import { STORAGE_BUCKETS, StorageKeyError, type StorageService } from "@/services/storage/types";

const secret = "unit-test-storage-secret-at-least-32-chars";
const text = (value: string) => new TextEncoder().encode(value);

let root: string;
const clock = new Date("2026-09-29T00:00:00Z");
let storage: StorageService;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "paperkaki-storage-"));
  storage = createLocalStorage({ rootDir: root, signingSecret: secret, now: () => clock });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("local storage adapter contract", () => {
  it("has the four private buckets", () => {
    expect([...STORAGE_BUCKETS]).toEqual([
      "paper-pdfs",
      "question-assets",
      "assessment-source-uploads",
      "submission-uploads",
    ]);
  });

  it("stores and returns bytes with their content type", async () => {
    await storage.put({ bucket: "paper-pdfs", key: "family-1/paper-1.pdf", body: text("%PDF-fake"), contentType: "application/pdf" });
    const stored = await storage.get({ bucket: "paper-pdfs", key: "family-1/paper-1.pdf" });
    expect(stored?.contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(stored?.body)).toBe("%PDF-fake");
  });

  it("accepts a string body and overwrites an existing key", async () => {
    const ref = { bucket: "question-assets", key: "q1.svg" } as const;
    await storage.put({ ...ref, body: "<svg/>", contentType: "image/svg+xml" });
    await storage.put({ ...ref, body: "<svg>v2</svg>", contentType: "image/svg+xml" });
    expect(new TextDecoder().decode((await storage.get(ref))?.body)).toBe("<svg>v2</svg>");
  });

  it("reports whether an object exists, per bucket", async () => {
    await storage.put({ bucket: "submission-uploads", key: "a/b.jpg", body: text("x"), contentType: "image/jpeg" });
    expect(await storage.exists({ bucket: "submission-uploads", key: "a/b.jpg" })).toBe(true);
    expect(await storage.exists({ bucket: "submission-uploads", key: "a/missing.jpg" })).toBe(false);
    expect(await storage.exists({ bucket: "paper-pdfs", key: "a/b.jpg" })).toBe(false);
    expect(await storage.exists({ bucket: "submission-uploads", key: "a" })).toBe(false);
  });

  it("returns null for a missing object", async () => {
    expect(await storage.get({ bucket: "paper-pdfs", key: "nothing/here.pdf" })).toBeNull();
  });

  it.each([
    ["parent traversal", "../outside.txt"],
    ["embedded traversal", "a/../../outside.txt"],
    ["dots inside a name", "a/b..c"],
    ["absolute path", "/etc/passwd"],
    ["backslash", "a\\b.txt"],
    ["empty key", ""],
    ["empty segment", "a//b"],
    ["dot segment", "a/./b"],
    ["trailing slash", "a/"],
    ["control character", "a\u0000b"],
  ])("rejects a bad key: %s", async (_label, key) => {
    await expect(storage.put({ bucket: "paper-pdfs", key, body: text("x"), contentType: "text/plain" })).rejects.toBeInstanceOf(StorageKeyError);
    await expect(storage.get({ bucket: "paper-pdfs", key })).rejects.toBeInstanceOf(StorageKeyError);
    await expect(storage.exists({ bucket: "paper-pdfs", key })).rejects.toBeInstanceOf(StorageKeyError);
    await expect(storage.createSignedUrl({ bucket: "paper-pdfs", key, expiresInSeconds: 60 })).rejects.toBeInstanceOf(StorageKeyError);
  });

  it("rejects an unknown bucket", async () => {
    const bucket = "public" as unknown as "paper-pdfs";
    await expect(storage.put({ bucket, key: "x.txt", body: text("x"), contentType: "text/plain" })).rejects.toBeInstanceOf(StorageKeyError);
  });

  it("does not put the rejected key in the error message", async () => {
    await expect(storage.get({ bucket: "paper-pdfs", key: "../secret-child-name.pdf" })).rejects.not.toThrow(/secret-child-name/);
  });
});

describe("signed URLs", () => {
  const ref = { bucket: "paper-pdfs", key: "family-1/paper 1.pdf" } as const;

  function parts(url: string) {
    const parsed = new URL(url, "http://localhost");
    const prefix = "/api/files/";
    expect(parsed.pathname.startsWith(prefix)).toBe(true);
    const [bucket, ...segments] = parsed.pathname.slice(prefix.length).split("/");
    return {
      bucket: bucket ?? "",
      key: segments.map(decodeURIComponent).join("/"),
      exp: parsed.searchParams.get("exp"),
      sig: parsed.searchParams.get("sig"),
    };
  }

  it("has the /api/files/{bucket}/{key}?exp&sig shape with an encoded key", async () => {
    const url = await storage.createSignedUrl({ ...ref, expiresInSeconds: 300 });
    expect(url).toMatch(/^\/api\/files\/paper-pdfs\/family-1\/paper%201\.pdf\?exp=\d+&sig=[A-Za-z0-9_-]+$/);
    expect(parts(url).exp).toBe(String(Math.floor(clock.getTime() / 1000) + 300));
  });

  it("verifies a fresh link", async () => {
    const url = await createSignedFileUrl(secret, { ...ref, expiresInSeconds: 60 }, clock);
    expect(await verifySignedFileRequest(secret, parts(url), clock)).toBe(true);
  });

  it("rejects an expired link", async () => {
    const url = await createSignedFileUrl(secret, { ...ref, expiresInSeconds: 60 }, clock);
    const later = new Date(clock.getTime() + 60_000);
    expect(await verifySignedFileRequest(secret, parts(url), new Date(later.getTime() - 1000))).toBe(true);
    expect(await verifySignedFileRequest(secret, parts(url), later)).toBe(false);
  });

  it("rejects a changed bucket, key, expiry or signature", async () => {
    const good = parts(await createSignedFileUrl(secret, { ...ref, expiresInSeconds: 60 }, clock));
    expect(await verifySignedFileRequest(secret, { ...good, bucket: "submission-uploads" }, clock)).toBe(false);
    expect(await verifySignedFileRequest(secret, { ...good, key: "family-2/paper 1.pdf" }, clock)).toBe(false);
    expect(await verifySignedFileRequest(secret, { ...good, exp: String(Number(good.exp) + 500) }, clock)).toBe(false);
    const flipped = good.sig?.startsWith("A") ? `B${good.sig.slice(1)}` : `A${good.sig?.slice(1)}`;
    expect(await verifySignedFileRequest(secret, { ...good, sig: flipped }, clock)).toBe(false);
  });

  it("rejects a link signed with another secret, and missing or malformed parts", async () => {
    const good = parts(await createSignedFileUrl("some-other-secret-that-is-at-least-32-chars", { ...ref, expiresInSeconds: 60 }, clock));
    expect(await verifySignedFileRequest(secret, good, clock)).toBe(false);
    const own = parts(await createSignedFileUrl(secret, { ...ref, expiresInSeconds: 60 }, clock));
    for (const broken of [
      { ...own, sig: null },
      { ...own, exp: null },
      { ...own, sig: "!!!" },
      { ...own, exp: "abc" },
      { ...own, key: "../x" },
      { ...own, bucket: "nope" },
    ]) {
      expect(await verifySignedFileRequest(secret, broken, clock)).toBe(false);
    }
  });

  it("refuses lifetimes above 600 seconds, and non-positive or fractional ones", async () => {
    for (const expiresInSeconds of [601, 3600, 0, -1, 1.5, Number.NaN]) {
      await expect(storage.createSignedUrl({ ...ref, expiresInSeconds })).rejects.toThrow(RangeError);
    }
    await expect(storage.createSignedUrl({ ...ref, expiresInSeconds: 600 })).resolves.toContain("/api/files/");
  });
});
