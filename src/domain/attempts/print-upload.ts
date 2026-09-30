/**
 * Uploading a finished paper that was printed and written on (M7). Pure and deterministic: what may be
 * uploaded, simple checks on each page by rule, the order of the pages, and the words a parent reads.
 * Nothing here looks at handwriting: reading it is the AI service's job, and marking is done by rules.
 */

export const PRINT_UPLOAD_LIMITS = {
  /** Pages in one upload. */
  maxPages: 24,
  /** One photo or one PDF. The action that receives it allows up to 12 MB in all. */
  maxBytes: 10 * 1024 * 1024,
  /** A photo whose shorter side is under this many pixels is too small to read. */
  minShortSidePx: 500,
} as const;

/** Below this sharpness (see `sharpnessOf`) a photo is called blurry. */
export const BLUR_BELOW = 12;

export type PageKind = { kind: "jpeg" | "png"; mime: "image/jpeg" | "image/png"; extension: "jpg" | "png" } | { kind: "pdf"; mime: "application/pdf"; extension: "pdf" } | { kind: "heic" } | { kind: "unknown" };

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((value, i) => bytes[offset + i] === value);

/** What a file is, from its first bytes. The file name and the type the browser claims are never trusted. */
export function sniffPageFile(bytes: Uint8Array): PageKind {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: "pdf", mime: "application/pdf", extension: "pdf" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "jpeg", mime: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "png", mime: "image/png", extension: "png" };
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return { kind: "heic" };
  }
  return { kind: "unknown" };
}

/** Width and height of a PNG or JPEG, read from its header. Null for anything else or a damaged header. */
export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const kind = sniffPageFile(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (kind.kind === "png") {
    if (bytes.length < 24) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (kind.kind === "jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1] as number;
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      // Start of frame markers (baseline, extended, progressive...), not the ones that share the range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return null;
}

/**
 * How sharp a picture is: the variance of a Laplacian over its grey pixels (0 to 255, row by row). Sharp
 * writing has strong edges, so a high number; a blurred or featureless page is close to zero. The browser
 * measures this on a small copy of the photo before it is uploaded.
 */
export function sharpnessOf(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = 4 * (gray[i] as number) - (gray[i - 1] as number) - (gray[i + 1] as number) - (gray[i - width] as number) - (gray[i + width] as number);
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

export type PageProblem = "blurry" | "rotated" | "small";

/**
 * The simple checks on one photo: too small to read, on its side (a printed paper is upright), or
 * blurry. Only what is certain is flagged; a page that passes is not mentioned at all.
 */
export function assessPage(input: { width: number | null; height: number | null; sharpness?: number | null | undefined }): PageProblem | null {
  const { width, height } = input;
  if (width !== null && height !== null) {
    if (Math.min(width, height) < PRINT_UPLOAD_LIMITS.minShortSidePx) return "small";
    if (width > height * 1.1) return "rotated";
  }
  if (input.sharpness !== null && input.sharpness !== undefined && input.sharpness < BLUR_BELOW) return "blurry";
  return null;
}

/** Exactly what to fix, for a page with a problem. */
export function problemText(problem: PageProblem, pageLabel: string): string {
  switch (problem) {
    case "blurry":
      return `${pageLabel} looks blurry. Retake it, holding the camera still.`;
    case "rotated":
      return `${pageLabel} is on its side. Retake it with the paper upright.`;
    case "small":
      return `${pageLabel} is too small to read. Retake it a little closer.`;
  }
}

/** A note when the number of pages is not what the printed paper has. Null when it matches. */
export function pageCountNote(expected: number | null, actual: number): string | null {
  if (expected === null || expected <= 0 || expected === actual) return null;
  const pages = (n: number) => (n === 1 ? "1 page" : `${n} pages`);
  if (actual < expected) return `The paper has ${pages(expected)} and you have added ${actual}. Add the missing ${expected - actual === 1 ? "page" : "pages"}, or submit anyway.`;
  return `The paper has ${pages(expected)} and you have added ${actual}. Remove any page that is not part of it, or submit anyway.`;
}

export type OrderablePage = { id: string; position: number; detectedPage: number | null };

/**
 * The order of the pages. When the footer number could be read on every page and no two pages share a
 * number, the pages go in that order; otherwise they stay in the order they were added, and the parent
 * can move them. Returns the ids in order.
 */
export function orderPages(pages: readonly OrderablePage[]): string[] {
  const byPosition = [...pages].sort((a, b) => a.position - b.position);
  const numbers = byPosition.map((page) => page.detectedPage);
  const allRead = numbers.every((number) => number !== null && number > 0);
  if (allRead && new Set(numbers).size === numbers.length) {
    return [...byPosition].sort((a, b) => (a.detectedPage as number) - (b.detectedPage as number)).map((page) => page.id);
  }
  return byPosition.map((page) => page.id);
}

/** Moves one id a step earlier or later, and leaves a list alone when the move is not possible. */
export function moveId(ids: readonly string[], id: string, direction: "earlier" | "later"): string[] {
  const index = ids.indexOf(id);
  const target = direction === "earlier" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[target]] = [next[target] as string, next[index] as string];
  return next;
}

export const HEIC_PAGE_MESSAGE = "We can't read this kind of photo yet. Please choose a photo saved as JPEG or PNG, or a PDF.";
export const UNKNOWN_PAGE_MESSAGE = "We can only use photos saved as JPEG or PNG, or a PDF.";
export const PDF_WITH_PHOTOS_MESSAGE = "Use one PDF, or photos of the pages, not both.";
