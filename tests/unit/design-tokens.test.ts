import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every colour pair the UI uses for text is checked against WCAG 2.x AA here, reading the real
 * values from globals.css so the test cannot drift from the design tokens. Body-size text needs
 * 4.5:1; large text (24px, or 18.66px bold) and the edges of controls need 3:1.
 */

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css);
  if (!match?.[1]) throw new Error(`Token --color-${name} is not a plain hex colour in globals.css`);
  return match[1].toLowerCase();
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** [text colour token, background token, where it is used]. All need 4.5:1. */
const TEXT_PAIRS: [string, string, string][] = [
  ["ink", "paper", "body text on the page"],
  ["ink", "surface", "body text on cards"],
  ["ink", "kaki-soft", "text on a teal tint (notes, selected rows)"],
  ["ink", "kaya-soft", "text on a kaya tint (chips, highlights)"],
  ["ink", "coral-soft", "text on a coral tint (gentle alerts)"],
  ["ink", "kaya", "text on a kaya accent (badges)"],
  ["ink-soft", "paper", "supporting text on the page"],
  ["ink-soft", "surface", "supporting text on cards"],
  ["ink-soft", "kaki-soft", "supporting text on a teal tint"],
  ["ink-soft", "kaya-soft", "supporting text on a kaya tint"],
  ["ink-soft", "line", "disabled button label"],
  ["surface", "kaki", "primary button label"],
  ["surface", "kaki-hover", "primary button label, hover and pressed"],
  ["surface", "kaki-strong", "label on the darkest teal"],
  ["kaki", "surface", "links and secondary button labels on cards"],
  ["kaki", "paper", "links on the page"],
  ["kaki-strong", "kaki-soft", "teal text on a teal tint (active tab, chips)"],
  ["kaki-strong", "surface", "strong teal text on cards"],
  ["kaki-strong", "paper", "strong teal text on the page"],
  ["kaya-strong", "kaya-soft", "warm chip text"],
  ["kaya-strong", "surface", "warm text on cards"],
  ["coral-strong", "coral-soft", "gentle alert text"],
  ["coral-strong", "surface", "error text on cards"],
  ["coral-strong", "paper", "error text on the page"],
  ["danger", "surface", "inline error text"],
  ["danger", "paper", "inline error text on the page"],
  ["warning-strong", "warning-soft", "Mock Mode notices (unchanged)"],
  // The child screens sit on a cream page with warm cards.
  ["ink", "child-canvas", "body text on the child's page"],
  ["ink", "child-card", "body text on the child's cards"],
  ["ink-soft", "child-canvas", "supporting text on the child's page"],
  ["ink-soft", "child-card", "supporting text on the child's cards"],
  ["kaki-strong", "child-canvas", "teal text on the child's page (Hi {name}, links)"],
  ["kaki-strong", "child-card", "teal text on the child's cards (nav label, row action)"],
  ["kaya-strong", "child-card", "warm text on the child's cards (points pill, balance)"],
  ["coral-strong", "child-card", "gentle alert text on the child's cards"],
  ["ink", "child-line", "text on the progress track and unselected dots"],
  ["surface", "kaki-hover", "primary button, pressed, on the child's hero"],
  ["kaki-strong", "paper", "strong teal text on the parent's page"],
  ["ink", "paper", "text on the returned-paper answer strip"],
  ["kaya-strong", "paper", "warm text on the page"],
];

/** The edge of a control must stand out from what is behind it: 3:1. */
const EDGE_PAIRS: [string, string, string][] = [
  ["line-strong", "surface", "input and checkbox edge on a card"],
  ["line-strong", "paper", "input and checkbox edge on the page"],
  ["kaki", "surface", "selected row and focus ring on cards"],
  ["kaki", "paper", "focus ring on the page"],
  ["kaki", "child-card", "selected choice and focus ring on the child's cards"],
  ["kaki", "child-line", "progress fill against its track"],
  ["kaya-strong", "kaya", "star outline against its yellow fill"],
  ["line-strong", "child-card", "empty star outline"],
  ["surface", "coral", "icon on the coral circle"],
  ["ink", "kaya", "icon on the kaya circle"],
];

describe("design tokens", () => {
  it.each(TEXT_PAIRS)("%s on %s reaches 4.5:1 (%s)", (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(EDGE_PAIRS)("%s against %s reaches 3:1 (%s)", (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it("keeps the tokens the rest of the app relies on", () => {
    for (const name of ["paper", "ink", "ink-soft", "kaki", "kaki-strong", "kaki-soft", "surface", "line", "danger", "warning"]) {
      expect(() => token(name)).not.toThrow();
    }
  });

  it("uses the agreed brand colours", () => {
    expect(token("kaki")).toBe("#0e7c6b");
    expect(token("kaki-hover")).toBe("#0b6556");
    expect(token("kaki-strong")).toBe("#0a5a4d");
    expect(token("kaki-soft")).toBe("#e3f2ee");
    expect(token("kaya")).toBe("#f2b53a");
    expect(token("kaya-soft")).toBe("#fdf3dc");
    expect(token("kaya-strong")).toBe("#8a5a00");
    expect(token("coral")).toBe("#e4735a");
    expect(token("coral-soft")).toBe("#fce9e4");
    expect(token("coral-strong")).toBe("#a33a22");
    expect(token("ink")).toBe("#1d2a2e");
    expect(token("ink-soft")).toBe("#52616a");
    expect(token("line")).toBe("#e5e1d8");
    expect(token("paper")).toBe("#faf7f1");
    expect(token("surface")).toBe("#ffffff");
  });
});
