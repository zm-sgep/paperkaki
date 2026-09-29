/**
 * Exact rational arithmetic on bigint. No floating point anywhere.
 * Every Rational is normalised: gcd(|n|, d) = 1 and d > 0.
 */

export class RationalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RationalError";
  }
}

export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function rational(n: bigint, d: bigint = 1n): Rational {
  if (d === 0n) throw new RationalError("Division by zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return g <= 1n ? { n, d } : { n: n / g, d: d / g };
}

export const add = (a: Rational, b: Rational): Rational => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational): Rational => rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational): Rational => rational(a.n * b.n, a.d * b.d);
export const neg = (a: Rational): Rational => ({ n: -a.n, d: a.d });

export function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new RationalError("Division by zero");
  return rational(a.n * b.d, a.d * b.n);
}

export const equals = (a: Rational, b: Rational): boolean => a.n === b.n && a.d === b.d;

export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

/** Parse an unsigned decimal literal such as "12", "12.50", "0.05" exactly. */
export function parseUnsignedDecimal(text: string): Rational {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new RationalError(`Malformed number: "${text}"`);
  const intPart = match[1] as string;
  const fracPart = match[2] ?? "";
  return rational(BigInt(intPart + fracPart), 10n ** BigInt(fracPart.length));
}

const MIXED = /^(-)?(\d+) (\d+)\/(\d+)$/;
const FRACTION = /^(-)?(\d+)\/(\d+)$/;
const DECIMAL = /^(-)?(\d+(?:\.\d+)?)$/;

/**
 * Parse an answer-style number: integer, decimal ("12.50"), fraction ("3/4"),
 * mixed number ("1 1/2") with an optional leading minus. Throws RationalError.
 */
export function parseRational(input: string): Rational {
  const text = input.trim().replace(/\s+/g, " ");
  let m = MIXED.exec(text);
  if (m) {
    const whole = BigInt(m[2] as string);
    const den = BigInt(m[4] as string);
    if (den === 0n) throw new RationalError(`Zero denominator in "${text}"`);
    const value = rational(whole * den + BigInt(m[3] as string), den);
    return m[1] ? neg(value) : value;
  }
  m = FRACTION.exec(text);
  if (m) {
    const den = BigInt(m[3] as string);
    if (den === 0n) throw new RationalError(`Zero denominator in "${text}"`);
    const value = rational(BigInt(m[2] as string), den);
    return m[1] ? neg(value) : value;
  }
  m = DECIMAL.exec(text);
  if (m) {
    const value = parseUnsignedDecimal(m[2] as string);
    return m[1] ? neg(value) : value;
  }
  throw new RationalError(`Malformed number: "${input}"`);
}

export function tryParseRational(input: string): Rational | null {
  try {
    return parseRational(input);
  } catch {
    return null;
  }
}

/** Canonical text: "5", "-5", "3/4". Equal rationals give equal strings. */
export function formatRational(r: Rational): string {
  return r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`;
}
