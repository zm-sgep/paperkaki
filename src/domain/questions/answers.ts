import type { Answer } from "@/schemas/question-content";
import { equals, formatRational, gcd, tryParseRational, type Rational } from "./rational";

/** Lower-case, trim and collapse internal whitespace. */
export function normaliseText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

interface FractionParts {
  whole: bigint;
  n: bigint;
  d: bigint;
}

const FRACTION_TEXT = /^(?:(\d+) )?(\d+)(?:\/(\d+))?$/;

/** Split "3/4", "1 1/2" or "2" into as-written parts. Null if malformed or zero denominator. */
function fractionParts(text: string): FractionParts | null {
  const m = FRACTION_TEXT.exec(text.trim().replace(/\s+/g, " "));
  if (!m) return null;
  const d = m[3] === undefined ? 1n : BigInt(m[3]);
  if (d === 0n) return null;
  if (m[1] !== undefined && m[3] === undefined) return null; // "1 2" is not a mixed number
  return { whole: m[1] === undefined ? 0n : BigInt(m[1]), n: BigInt(m[2] as string), d };
}

function partsToRational(p: FractionParts): Rational {
  return { n: p.whole * p.d + p.n, d: p.d };
}

/** Simplest form: lowest terms, and a mixed number's fraction part is proper. */
export function isSimplestFraction(text: string): boolean {
  const p = fractionParts(text);
  if (!p) return false;
  if (gcd(p.n, p.d) !== 1n) return p.n === 0n && p.d === 1n;
  if (p.whole > 0n) return p.n > 0n && p.n < p.d;
  return true;
}

/**
 * Canonical string for an answer. Equal answers give equal strings:
 * mcq -> "B"; number -> "25/2" (exact rational) plus unit; fraction -> reduced
 * rational; text -> sorted, normalised, de-duplicated accepted strings.
 */
export function canonicaliseAnswer(answer: Answer): string {
  switch (answer.kind) {
    case "mcq":
      return `mcq:${answer.correct}`;
    case "number": {
      const r = tryParseRational(answer.value);
      if (!r) throw new Error(`Malformed number answer: "${answer.value}"`);
      return `number:${formatRational(r)}${answer.unit ? `:${answer.unit}` : ""}`;
    }
    case "fraction": {
      const p = fractionParts(answer.value);
      if (!p) throw new Error(`Malformed fraction answer: "${answer.value}"`);
      return `fraction:${formatRational(reduce(partsToRational(p)))}`;
    }
    case "text":
      return `text:${[...new Set(answer.accepted.map(normaliseText))].sort().join("|")}`;
  }
}

function reduce(r: Rational): Rational {
  const g = gcd(r.n, r.d);
  return g > 1n ? { n: r.n / g, d: r.d / g } : r;
}

/**
 * Does the child's/given response match the expected answer?
 * `given` is the raw response text (for mcq, the option id).
 */
export function answersEquivalent(expected: Answer, given: string): boolean {
  switch (expected.kind) {
    case "mcq":
      return given.trim() === expected.correct;
    case "text": {
      const g = normaliseText(given);
      return g !== "" && expected.accepted.some((a) => normaliseText(a) === g);
    }
    case "number": {
      const e = tryParseRational(expected.value);
      const g = tryParseRational(given);
      return e !== null && g !== null && equals(e, g);
    }
    case "fraction": {
      const e = fractionParts(expected.value);
      const g = fractionParts(given);
      if (!e || !g) return false;
      if (!expected.acceptEquivalent) {
        return e.whole === g.whole && e.n === g.n && e.d === g.d;
      }
      if (!equals(reduce(partsToRational(e)), reduce(partsToRational(g)))) return false;
      return !expected.requireSimplest || isSimplestFraction(given);
    }
  }
}
