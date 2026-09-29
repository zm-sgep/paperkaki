/** Helvetica (WinAnsi) has no glyph for these; map to the nearest printable form. */
const GLYPH_MAP: Record<string, string> = {
  "−": "–", // minus sign -> en dash
  "ℓ": "l", // script small l (litre) -> l
  " ": " ",
};

export function pdfText(text: string): string {
  return text.replace(/[−ℓ ]/g, (c) => GLYPH_MAP[c] ?? c);
}

