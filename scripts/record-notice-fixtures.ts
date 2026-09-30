import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Records the answers the `fixture` AI provider gives for the sample notices: for each sample file
 * (the PDF, and the two photos taken together), the recorded extraction is written to
 * tests/fixtures/ai/<sha256 of the file bytes, in order>.json. The recorded answer itself is
 * tests/fixtures/notices/p3-eoy-sample.extraction.json, written by hand to match the invented letter.
 *
 * Run after scripts/make-sample-notice.ts (and the photo script):  npx tsx scripts/record-notice-fixtures.ts
 */

const root = process.cwd();
const notices = path.join(root, "tests/fixtures/notices");
const recorded = readFileSync(path.join(notices, "p3-eoy-sample.extraction.json"), "utf8");

const variants: Array<{ name: string; files: string[] }> = [
  { name: "p3-eoy-sample.pdf", files: ["p3-eoy-sample.pdf"] },
  { name: "p3-eoy-sample-photos", files: ["p3-eoy-sample-photo-1.png", "p3-eoy-sample-photo-2.png"] },
];

mkdirSync(path.join(root, "tests/fixtures/ai"), { recursive: true });
for (const variant of variants) {
  const hash = createHash("sha256");
  for (const file of variant.files) hash.update(readFileSync(path.join(notices, file)));
  const sha256 = hash.digest("hex");
  writeFileSync(path.join(root, "tests/fixtures/ai", `${sha256}.json`), recorded);
  console.log(`${variant.name} -> tests/fixtures/ai/${sha256}.json`);
}
