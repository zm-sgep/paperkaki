import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Relative to the repository root (where every test runner starts), so the helper also loads under
// Playwright, which compiles specs as CommonJS and has no import.meta.
const STANDARD_FONTS = `${path.resolve(process.cwd(), "node_modules/pdfjs-dist/standard_fonts")}/`;

export interface ExtractedPdf {
  pages: string[];
  text: string;
}

/** Extract per-page text from a PDF buffer with pdfjs (Node, legacy build). Whitespace is collapsed. */
export async function extractPdfText(buffer: Uint8Array): Promise<ExtractedPdf> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONTS,
  });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const raw = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(raw.replace(/\s+/g, " ").trim());
  }
  await task.destroy();
  return { pages, text: pages.join("\n") };
}
