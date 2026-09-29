import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/files/[bucket]/[...key]/route";
import { env } from "@/config/env";
import { createSignedFileUrl } from "@/services/storage/signing";
import { getStorage } from "@/services/storage";

const key = "family-route-test/paper-1.pdf";
const bytes = new TextEncoder().encode("%PDF-1.4 fictional test paper");

async function fetchSigned(url: string) {
  const { pathname } = new URL(url, "http://localhost");
  const [, , , bucket, ...segments] = pathname.split("/");
  return GET(new Request(new URL(url, "http://localhost")), {
    params: Promise.resolve({ bucket: bucket ?? "", key: segments.map(decodeURIComponent) }),
  });
}

afterAll(async () => {
  await rm(path.resolve(env.STORAGE_LOCAL_DIR, "paper-pdfs", "family-route-test"), { recursive: true, force: true });
  await rm(path.resolve(env.STORAGE_LOCAL_DIR, ".meta", "paper-pdfs", "family-route-test"), { recursive: true, force: true });
});

describe("GET /api/files/{bucket}/{key}", () => {
  it("streams a file for a valid link, private and with its content type", async () => {
    const storage = getStorage();
    await storage.put({ bucket: "paper-pdfs", key, body: bytes, contentType: "application/pdf" });
    const response = await fetchSigned(await storage.createSignedUrl({ bucket: "paper-pdfs", key, expiresInSeconds: 60 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("answers 404 with the same body for a tampered, expired, unsigned or missing file", async () => {
    const storage = getStorage();
    const valid = await storage.createSignedUrl({ bucket: "paper-pdfs", key, expiresInSeconds: 60 });
    const expired = await createSignedFileUrl(
      env.STORAGE_SIGNING_SECRET,
      { bucket: "paper-pdfs", key, expiresInSeconds: 60 },
      new Date(Date.now() - 3_600_000),
    );
    const missing = await storage.createSignedUrl({ bucket: "paper-pdfs", key: "family-route-test/none.pdf", expiresInSeconds: 60 });
    const tampered = valid.replace(/sig=(.)/, (_all, first: string) => `sig=${first === "A" ? "B" : "A"}`);
    const otherBucket = valid.replace("/paper-pdfs/", "/submission-uploads/");
    const unsigned = valid.split("?")[0] ?? valid;

    const bodies = new Set<string>();
    for (const url of [tampered, expired, missing, otherBucket, unsigned]) {
      const response = await fetchSigned(url);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      bodies.add(await response.text());
    }
    expect(bodies.size).toBe(1);
  });
});
