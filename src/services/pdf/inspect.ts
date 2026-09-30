import path from "node:path";

/**
 * How many pages a PDF has, without rendering it. Returns null when the file is not a PDF we can
 * open (damaged, password-protected). pdfjs is loaded on demand; see next.config.ts for why it is
 * kept out of the server bundle.
 */
export async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = `${path.resolve(/*turbopackIgnore: true*/ process.cwd(), "node_modules/pdfjs-dist/standard_fonts")}/`;
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, standardFontDataUrl, verbosity: 0 });
  try {
    const doc = await task.promise;
    return doc.numPages;
  } catch {
    return null;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
