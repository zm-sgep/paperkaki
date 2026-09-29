import type { Unit } from "@/schemas/question-content";
import { rational, mul, type Rational } from "@/domain/questions/rational";

export type Dimension = "length" | "mass" | "volume" | "time" | "money";

/** How many of the smallest unit in each dimension one of this unit is. Integers only. */
const UNIT_TABLE: Record<Unit, { dimension: Dimension; perSmallest: bigint }> = {
  cm: { dimension: "length", perSmallest: 1n },
  m: { dimension: "length", perSmallest: 100n },
  km: { dimension: "length", perSmallest: 100_000n },
  g: { dimension: "mass", perSmallest: 1n },
  kg: { dimension: "mass", perSmallest: 1000n },
  ml: { dimension: "volume", perSmallest: 1n },
  l: { dimension: "volume", perSmallest: 1000n },
  min: { dimension: "time", perSmallest: 1n },
  h: { dimension: "time", perSmallest: 60n },
  $: { dimension: "money", perSmallest: 1n },
};

const ALIASES: Record<string, Unit> = {
  cm: "cm",
  centimetre: "cm",
  centimetres: "cm",
  centimeter: "cm",
  centimeters: "cm",
  m: "m",
  metre: "m",
  metres: "m",
  meter: "m",
  meters: "m",
  km: "km",
  kilometre: "km",
  kilometres: "km",
  kilometer: "km",
  kilometers: "km",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  min: "min",
  mins: "min",
  minute: "min",
  minutes: "min",
  h: "h",
  hr: "h",
  hrs: "h",
  hour: "h",
  hours: "h",
  $: "$",
  dollar: "$",
  dollars: "$",
};

/** Lower-case a unit word and map "ℓ", "L", "litres", "hrs" and so on to a supported unit. Null if unknown. */
export function normaliseUnit(text: string): Unit | null {
  const key = text.trim().toLowerCase().replace(/ℓ/g, "l").replace(/\.$/, "");
  return ALIASES[key] ?? null;
}

export function dimensionOf(unit: Unit): Dimension {
  return UNIT_TABLE[unit].dimension;
}

/** `value` of `from` expressed in `to`. Both must share a dimension. */
export function convertQuantity(value: Rational, from: Unit, to: Unit): Rational {
  if (dimensionOf(from) !== dimensionOf(to)) throw new Error(`Cannot convert ${from} to ${to}`);
  return mul(value, rational(UNIT_TABLE[from].perSmallest, UNIT_TABLE[to].perSmallest));
}

/** Larger first: "kg" before "g". Used to check that a compound answer reads big to small. */
export function unitSize(unit: Unit): bigint {
  return UNIT_TABLE[unit].perSmallest;
}
