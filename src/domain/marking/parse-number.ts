import type { Unit } from "@/schemas/question-content";
import { parseUnsignedDecimal, neg, type Rational } from "@/domain/questions/rational";
import { normaliseUnit } from "./units";

export type NumberSegment = { value: Rational; unit?: Unit };

export type ParsedNumberText =
  | { ok: true; segments: NumberSegment[] }
  | { ok: false; reason: string };

/** "1,250" and "1250" and "12.50", never "12,50" or "1 250". A minus sign is allowed on the first segment. */
const SEGMENT = /\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([a-zℓ$]+)?/y;

function toRational(numberText: string): Rational {
  const negative = numberText.startsWith("-");
  const digits = numberText.replace(/^-/, "").replace(/,/g, "");
  const value = parseUnsignedDecimal(digits);
  return negative ? neg(value) : value;
}

/**
 * Read a typed numeric answer leniently:
 * - spaces around the number, thousands commas ("1,250"), a leading "$" ("$12.50");
 * - trailing unit words ("cm", "kg", "ml", "ℓ", "l", "min", "hours" ...);
 * - compound measures ("1 kg 250 g", "2 h 15 min") as several segments.
 *
 * Anything else (stray words, "12,50", ".5", "1/2") is not guessed at: `ok: false`.
 */
export function parseNumberText(input: string): ParsedNumberText {
  let text = input
    .replace(/ /g, " ")
    .replace(/−/g, "-")
    .trim()
    .toLowerCase()
    .replace(/ℓ/g, "l")
    .replace(/\.$/, "")
    .trim();

  let prefixUnit: Unit | undefined;
  if (text.startsWith("$")) {
    prefixUnit = "$";
    text = text.slice(1).trim();
  }
  if (text === "") return { ok: false, reason: "No number found." };

  const segments: NumberSegment[] = [];
  SEGMENT.lastIndex = 0;
  let position = 0;
  while (position < text.length) {
    SEGMENT.lastIndex = position;
    const match = SEGMENT.exec(text);
    if (!match) return { ok: false, reason: "Could not read the typed answer as a number." };
    const numberText = match[1] as string;
    const unitText = match[2];
    let unit: Unit | undefined;
    if (unitText !== undefined) {
      const known = normaliseUnit(unitText);
      if (!known) return { ok: false, reason: `Unrecognised unit or word "${unitText}".` };
      unit = known;
    }
    segments.push(unit ? { value: toRational(numberText), unit } : { value: toRational(numberText) });
    position = SEGMENT.lastIndex;
  }

  if (prefixUnit) {
    const first = segments[0] as NumberSegment;
    if (segments.length !== 1 || first.unit !== undefined) {
      return { ok: false, reason: "Money sign combined with another unit." };
    }
    return { ok: true, segments: [{ value: first.value, unit: prefixUnit }] };
  }

  if (segments.length > 1) {
    for (const segment of segments) {
      if (segment.unit === undefined) return { ok: false, reason: "Every part of a compound answer needs a unit." };
      if (segment.value.n < 0n) return { ok: false, reason: "Negative part in a compound answer." };
    }
  }
  return { ok: true, segments };
}
