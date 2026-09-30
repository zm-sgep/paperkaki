import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Reads the invented sample notice files (see scripts/make-sample-notice.ts). Tests only. */
const dir = path.resolve(process.cwd(), "tests/fixtures/notices");

export function sampleNoticePdf(): Uint8Array {
  return new Uint8Array(readFileSync(path.join(dir, "p3-eoy-sample.pdf")));
}

/** The two photos of the two-page letter, in page order. */
export function sampleNoticePhotos(): Uint8Array[] {
  return ["p3-eoy-sample-photo-1.png", "p3-eoy-sample-photo-2.png"].map((name) => new Uint8Array(readFileSync(path.join(dir, name))));
}

export function sha256Of(files: readonly Uint8Array[]): string {
  const hash = createHash("sha256");
  for (const file of files) hash.update(file);
  return hash.digest("hex");
}
