import { describe, expect, it } from "vitest";
import {
  AngleBlockSchema,
  BarGraphBlockSchema,
  BlockSchema,
  GridBlockSchema,
  LinesBlockSchema,
  QuestionContentSchema,
} from "@/schemas/question-content";

const bar = {
  t: "bargraph",
  title: "Books read",
  categoryAxisLabel: "Month",
  valueAxisLabel: "Number of books",
  scale: { max: 50, step: 10 },
  bars: [
    { label: "March", value: 30 },
    { label: "April", value: 45 },
  ],
  orientation: "vertical",
};
const grid = { t: "grid", cols: 6, rows: 4, cellMm: 8, shaded: [[0, 0], [1, 0]] };
const angle = { t: "angle", degrees: 90, armLengthMm: 25, label: "P", showRightAngleMark: true };
const lines = {
  t: "lines",
  segments: [{ from: [0, 0], to: [4, 0], label: "AB" }],
  points: [{ at: [2, 3], label: "X" }],
  dotGrid: { cols: 6, rows: 5 },
};

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v).success;
const message = (schema: { safeParse: (v: unknown) => { error?: { issues: { message: string }[] } } }, v: unknown) =>
  schema.safeParse(v).error?.issues.map((i) => i.message).join(" | ") ?? "";

describe("bargraph block", () => {
  it("accepts a valid vertical and horizontal graph", () => {
    expect(ok(BarGraphBlockSchema, bar)).toBe(true);
    expect(ok(BarGraphBlockSchema, { ...bar, orientation: "horizontal" })).toBe(true);
  });

  it("accepts scales of 2, 5 and 10 and values between gridlines", () => {
    for (const step of [2, 5, 10]) {
      expect(ok(BarGraphBlockSchema, { ...bar, scale: { max: step * 10, step }, bars: [{ label: "March", value: step }, { label: "April", value: step * 9 }] })).toBe(true);
    }
    expect(ok(BarGraphBlockSchema, { ...bar, scale: { max: 20, step: 2 }, bars: [{ label: "A", value: 7 }, { label: "B", value: 20 }] })).toBe(true);
  });

  it("rejects a value above the scale max", () => {
    const bad = { ...bar, bars: [{ label: "March", value: 60 }, { label: "April", value: 10 }] };
    expect(ok(BarGraphBlockSchema, bad)).toBe(false);
    expect(message(BarGraphBlockSchema, bad)).toContain("exceeds the scale max");
  });

  it("rejects fewer than 2 or more than 6 bars", () => {
    expect(ok(BarGraphBlockSchema, { ...bar, bars: [{ label: "A", value: 1 }] })).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => ({ label: `Bar${i}`, value: i }));
    expect(ok(BarGraphBlockSchema, { ...bar, bars: seven })).toBe(false);
    const six = seven.slice(0, 6);
    expect(ok(BarGraphBlockSchema, { ...bar, bars: six })).toBe(true);
  });

  it("rejects a bad scale, duplicate labels, decimals and unknown orientation", () => {
    expect(ok(BarGraphBlockSchema, { ...bar, scale: { max: 50, step: 20 } })).toBe(false);
    expect(ok(BarGraphBlockSchema, { ...bar, scale: { max: 10, step: 20 } })).toBe(false);
    expect(ok(BarGraphBlockSchema, { ...bar, scale: { max: 100, step: 1 } })).toBe(false);
    expect(ok(BarGraphBlockSchema, { ...bar, bars: [{ label: "A", value: 1 }, { label: "A", value: 2 }] })).toBe(false);
    expect(ok(BarGraphBlockSchema, { ...bar, bars: [{ label: "A", value: 1.5 }, { label: "B", value: 2 }] })).toBe(false);
    expect(ok(BarGraphBlockSchema, { ...bar, orientation: "diagonal" })).toBe(false);
    expect(ok(BarGraphBlockSchema, { ...bar, title: "" })).toBe(false);
    expect(ok(BarGraphBlockSchema, { ...bar, extra: 1 })).toBe(false);
  });
});

describe("grid block", () => {
  it("accepts shaded squares, an outline, or both", () => {
    expect(ok(GridBlockSchema, grid)).toBe(true);
    expect(ok(GridBlockSchema, { t: "grid", cols: 5, rows: 5, cellMm: 8, outline: [[1, 1], [4, 1], [4, 4], [1, 4]] })).toBe(true);
    expect(ok(GridBlockSchema, { ...grid, outline: [[0, 0], [6, 0], [6, 4], [0, 4]] })).toBe(true);
  });

  it("requires shaded or outline", () => {
    const bad = { t: "grid", cols: 6, rows: 4, cellMm: 8 };
    expect(ok(GridBlockSchema, bad)).toBe(false);
    expect(message(GridBlockSchema, bad)).toContain("shaded squares, an outline");
  });

  it("rejects out-of-range size and cells outside the grid", () => {
    expect(ok(GridBlockSchema, { ...grid, cols: 1 })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, cols: 15 })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, rows: 11 })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, cellMm: 4 })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, cellMm: 11 })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, shaded: [[6, 0]] })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, shaded: [[0, 4]] })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, shaded: [[0, 0], [0, 0]] })).toBe(false);
  });

  it("rejects a grid too wide for the page", () => {
    expect(ok(GridBlockSchema, { ...grid, cols: 14, cellMm: 10 })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, cols: 14, cellMm: 9 })).toBe(true);
  });

  it("rejects a non-rectilinear or out-of-grid outline", () => {
    expect(ok(GridBlockSchema, { ...grid, outline: [[0, 0], [3, 1], [3, 3], [0, 3]] })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, outline: [[0, 0], [7, 0], [7, 3], [0, 3]] })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, outline: [[0, 0], [3, 0], [3, 3]] })).toBe(false);
    expect(ok(GridBlockSchema, { ...grid, outline: [[0, 0], [0, 0], [3, 0], [3, 3]] })).toBe(false);
  });
});

describe("angle block", () => {
  it("accepts a marked right angle and a plain acute angle", () => {
    expect(ok(AngleBlockSchema, angle)).toBe(true);
    expect(ok(AngleBlockSchema, { t: "angle", degrees: 45, armLengthMm: 20 })).toBe(true);
    expect(ok(AngleBlockSchema, { t: "angle", degrees: 90, armLengthMm: 20 })).toBe(true);
  });

  it("rejects degrees outside 20..170 and non-integers", () => {
    expect(ok(AngleBlockSchema, { ...angle, degrees: 19, showRightAngleMark: false })).toBe(false);
    expect(ok(AngleBlockSchema, { ...angle, degrees: 171, showRightAngleMark: false })).toBe(false);
    expect(ok(AngleBlockSchema, { ...angle, degrees: 45.5, showRightAngleMark: false })).toBe(false);
    expect(ok(AngleBlockSchema, { t: "angle", degrees: 20, armLengthMm: 20 })).toBe(true);
    expect(ok(AngleBlockSchema, { t: "angle", degrees: 170, armLengthMm: 20 })).toBe(true);
  });

  it("allows the right-angle mark only on exactly 90 degrees", () => {
    const bad = { ...angle, degrees: 80 };
    expect(ok(AngleBlockSchema, bad)).toBe(false);
    expect(message(AngleBlockSchema, bad)).toContain("90 degree");
    expect(ok(AngleBlockSchema, { ...bad, showRightAngleMark: false })).toBe(true);
  });

  it("rejects missing or absurd arm length", () => {
    expect(ok(AngleBlockSchema, { t: "angle", degrees: 45 })).toBe(false);
    expect(ok(AngleBlockSchema, { t: "angle", degrees: 45, armLengthMm: 5 })).toBe(false);
    expect(ok(AngleBlockSchema, { t: "angle", degrees: 45, armLengthMm: 100 })).toBe(false);
  });
});

describe("lines block", () => {
  it("accepts segments with labels, points and a dot grid", () => {
    expect(ok(LinesBlockSchema, lines)).toBe(true);
    expect(ok(LinesBlockSchema, { t: "lines", segments: [{ from: [0, 0], to: [12, 12] }] })).toBe(true);
  });

  it("rejects coordinates outside 0..12 and non-integers", () => {
    expect(ok(LinesBlockSchema, { t: "lines", segments: [{ from: [0, 0], to: [13, 0] }] })).toBe(false);
    expect(ok(LinesBlockSchema, { t: "lines", segments: [{ from: [-1, 0], to: [3, 0] }] })).toBe(false);
    expect(ok(LinesBlockSchema, { t: "lines", segments: [{ from: [0, 0.5], to: [3, 0] }] })).toBe(false);
  });

  it("rejects an empty list, a zero-length segment and unknown fields", () => {
    expect(ok(LinesBlockSchema, { t: "lines", segments: [] })).toBe(false);
    expect(ok(LinesBlockSchema, { t: "lines", segments: [{ from: [1, 1], to: [1, 1] }] })).toBe(false);
    expect(ok(LinesBlockSchema, { ...lines, colour: "red" })).toBe(false);
  });

  it("keeps everything on the dot grid when there is one", () => {
    expect(ok(LinesBlockSchema, { ...lines, dotGrid: { cols: 3, rows: 5 } })).toBe(false);
    expect(ok(LinesBlockSchema, { ...lines, points: [{ at: [2, 9], label: "X" }] })).toBe(false);
    expect(ok(LinesBlockSchema, { ...lines, dotGrid: { cols: 1, rows: 5 } })).toBe(false);
    expect(ok(LinesBlockSchema, { ...lines, dotGrid: { cols: 14, rows: 5 } })).toBe(false);
  });
});

describe("blocks inside question content", () => {
  it("BlockSchema discriminates all four diagram types", () => {
    for (const block of [bar, grid, angle, lines]) expect(ok(BlockSchema, block)).toBe(true);
    expect(ok(BlockSchema, { t: "chart" })).toBe(false);
    expect(ok(QuestionContentSchema, { stem: [bar, { t: "p", c: [{ t: "text", v: "Which month?" }] }] })).toBe(true);
  });
});
