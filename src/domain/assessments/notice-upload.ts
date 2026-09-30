/**
 * What may be uploaded as a school notice. Pure: checks are made on the first bytes and the sizes,
 * never on the file name or the type the browser claims, and messages are what a parent reads.
 */

export const NOTICE_UPLOAD_LIMITS = {
  /** Together, for all pictures of one notice. */
  maxBytes: 10 * 1024 * 1024,
  /** PDF pages, or pictures. */
  maxPages: 10,
} as const;

export type NoticeMime = "application/pdf" | "image/jpeg" | "image/png";

export type SniffedFile = { kind: "known"; mime: NoticeMime; extension: "pdf" | "jpg" | "png" } | { kind: "heic" } | { kind: "unknown" };

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((value, i) => bytes[offset + i] === value);

/** Reads the file's own signature: %PDF-, JPEG, PNG, or a HEIC/HEIF photo (recognised only to say it cannot be read yet). */
export function sniffNoticeFile(bytes: Uint8Array): SniffedFile {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: "known", mime: "application/pdf", extension: "pdf" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "known", mime: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "known", mime: "image/png", extension: "png" };
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return { kind: "heic" };
  }
  return { kind: "unknown" };
}

export type NoticeUploadCheck = { ok: true; kind: "pdf" | "images" } | { ok: false; message: string };

export const HEIC_MESSAGE =
  "We can't read this kind of photo yet. Please choose a photo or screenshot saved as JPEG or PNG, or a PDF.";

/** Checks the set of files chosen for one notice: how many, how big, and of what kind. */
export function checkNoticeUpload(files: readonly { size: number; sniffed: SniffedFile }[]): NoticeUploadCheck {
  if (files.length === 0 || files.every((file) => file.size === 0)) return { ok: false, message: "Choose the school notice to upload." };
  if (files.some((file) => file.size === 0)) return { ok: false, message: "One of the files is empty. Please choose it again." };
  if (files.some((file) => file.sniffed.kind === "heic")) return { ok: false, message: HEIC_MESSAGE };
  if (files.some((file) => file.sniffed.kind === "unknown")) {
    return { ok: false, message: "We can only read a PDF, or photos and screenshots saved as JPEG or PNG." };
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > NOTICE_UPLOAD_LIMITS.maxBytes) return { ok: false, message: "This file is too big. Please choose one under 10 MB." };
  const pdfs = files.filter((file) => file.sniffed.kind === "known" && file.sniffed.mime === "application/pdf").length;
  if (pdfs > 0) {
    if (files.length > 1) return { ok: false, message: "Choose one PDF, or several photos, not both." };
    return { ok: true, kind: "pdf" };
  }
  if (files.length > NOTICE_UPLOAD_LIMITS.maxPages) return { ok: false, message: `Choose up to ${NOTICE_UPLOAD_LIMITS.maxPages} photos.` };
  return { ok: true, kind: "images" };
}

export const TOO_MANY_PAGES_MESSAGE = `This PDF has more than ${NOTICE_UPLOAD_LIMITS.maxPages} pages. Please choose the pages with the timetable and the Mathematics topics.`;
export const UNREADABLE_PDF_MESSAGE = "We couldn't open this PDF. Please try another file.";
