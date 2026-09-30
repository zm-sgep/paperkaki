import { describe, expect, it } from "vitest";
import {
  BLUR_BELOW,
  assessPage,
  moveId,
  orderPages,
  pageCountNote,
  problemText,
  readImageSize,
  sharpnessOf,
  sniffPageFile,
} from "@/domain/attempts";
import { encodeFixturePage } from "@/services/ai/fixture-pages";

describe("what can be uploaded", () => {
  it("reads the kind of file from its first bytes, never its name", () => {
    expect(sniffPageFile(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1]))).toMatchObject({ kind: "pdf" });
    expect(sniffPageFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ kind: "jpeg", extension: "jpg" });
    expect(sniffPageFile(encodeFixturePage({}))).toMatchObject({ kind: "png" });
    expect(sniffPageFile(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toEqual({ kind: "heic" });
    expect(sniffPageFile(new Uint8Array([1, 2, 3]))).toEqual({ kind: "unknown" });
  });

  it("reads the size of a PNG and a JPEG from the header", () => {
    expect(readImageSize(encodeFixturePage({}, { width: 700, height: 900 }))).toEqual({ width: 700, height: 900 });
    // A minimal JPEG: SOI, APP0 (16 bytes), SOF0 with height 1200 and width 800.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x03, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    expect(readImageSize(jpeg)).toEqual({ width: 800, height: 1200 });
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(readImageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("simple checks on a page", () => {
  it("measures sharpness: a page of ink lines is sharp, a flat page is not", () => {
    const width = 60;
    const height = 60;
    const sharp = new Uint8Array(width * height).map((_, i) => ((i % width) % 6 < 3 ? 30 : 230));
    const flat = new Uint8Array(width * height).fill(200);
    const blurred = new Uint8Array(width * height).map((_, i) => 200 + Math.sin(((i % width) / width) * Math.PI) * 4);
    expect(sharpnessOf(sharp, width, height)).toBeGreaterThan(BLUR_BELOW * 100);
    expect(sharpnessOf(flat, width, height)).toBe(0);
    expect(sharpnessOf(blurred, width, height)).toBeLessThan(BLUR_BELOW);
    expect(sharpnessOf(sharp, 2, 2)).toBe(0);
  });

  it("flags only what is certain: too small, on its side, or blurry", () => {
    expect(assessPage({ width: 1200, height: 1700, sharpness: 400 })).toBeNull();
    expect(assessPage({ width: 300, height: 400, sharpness: 400 })).toBe("small");
    expect(assessPage({ width: 1700, height: 1200, sharpness: 400 })).toBe("rotated");
    expect(assessPage({ width: 1200, height: 1700, sharpness: 2 })).toBe("blurry");
    // Unknown size or sharpness is never a reason to flag a page.
    expect(assessPage({ width: null, height: null })).toBeNull();
    expect(assessPage({ width: 1200, height: 1700, sharpness: null })).toBeNull();
    // A square-ish page is not "on its side".
    expect(assessPage({ width: 1000, height: 950, sharpness: 300 })).toBeNull();
  });

  it("says exactly what to fix, in plain words", () => {
    expect(problemText("blurry", "Page 3")).toBe("Page 3 looks blurry. Retake it, holding the camera still.");
    expect(problemText("rotated", "Page 2")).toMatch(/upright/);
    expect(problemText("small", "Page 1")).toMatch(/closer/);
    for (const problem of ["blurry", "rotated", "small"] as const) expect(problemText(problem, "Page 1")).not.toMatch(/pixel|sharpness|ocr|model/i);
  });

  it("notes a page count that is not the paper's, and says nothing when it is", () => {
    expect(pageCountNote(8, 8)).toBeNull();
    expect(pageCountNote(null, 3)).toBeNull();
    expect(pageCountNote(8, 6)).toBe("The paper has 8 pages and you have added 6. Add the missing pages, or submit anyway.");
    expect(pageCountNote(8, 7)).toMatch(/Add the missing page,/);
    expect(pageCountNote(4, 5)).toMatch(/Remove any page that is not part of it/);
  });
});

describe("the order of the pages", () => {
  const page = (id: string, position: number, detectedPage: number | null) => ({ id, position, detectedPage });

  it("goes by the footer number when every page has one and none repeats", () => {
    expect(orderPages([page("a", 1, 3), page("b", 2, 1), page("c", 3, 2)])).toEqual(["b", "c", "a"]);
  });

  it("keeps the order the pages were added in when a footer could not be read, or two pages share a number", () => {
    expect(orderPages([page("a", 1, 3), page("b", 2, null), page("c", 3, 2)])).toEqual(["a", "b", "c"]);
    expect(orderPages([page("a", 1, 3), page("b", 2, 0), page("c", 3, 2)])).toEqual(["a", "b", "c"]);
    expect(orderPages([page("a", 1, 2), page("b", 2, 2)])).toEqual(["a", "b"]);
    expect(orderPages([])).toEqual([]);
  });

  it("moves one page a step, and leaves the list alone when it cannot", () => {
    expect(moveId(["a", "b", "c"], "b", "earlier")).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "b", "later")).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], "a", "earlier")).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], "c", "later")).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], "x", "later")).toEqual(["a", "b", "c"]);
  });
});
