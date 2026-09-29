import type { Block } from "@/schemas/question-content";

/**
 * Pure geometry for diagram blocks (bar graph, grid, angle, lines).
 *
 * Everything is computed in PDF points from fixed constants and the block's
 * own data, so the same block always produces the same drawing. No text
 * measurement, no randomness, no rendering library: the React layer only
 * paints what these functions return.
 */

type Bar = Extract<Block, { t: "bargraph" }>;
type Grid = Extract<Block, { t: "grid" }>;
type Angle = Extract<Block, { t: "angle" }>;
type Lines = Extract<Block, { t: "lines" }>;

export const PT_PER_MM = 72 / 25.4;

/** Round to 2 decimals so coordinates print identically everywhere. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface TextMark {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  size: number;
  bold?: boolean;
}
export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Bar graph
// ---------------------------------------------------------------------------

export interface BarGraphLayout {
  width: number;
  height: number;
  texts: TextMark[];
  gridlines: Seg[];
  axes: Seg[];
  bars: Rect[];
}

const BAR_FONT = 8;
/** Conservative average Helvetica glyph width as a fraction of the font size. */
const GLYPH_EM = 0.56;

/** Split a label into at most two lines, on spaces, each within `maxChars` where possible. */
export function wrapLabel(label: string, maxChars: number): string[] {
  if (label.length <= maxChars) return [label];
  const words = label.split(" ");
  if (words.length === 1) return [label];
  let best = 1;
  for (let i = 1; i < words.length; i += 1) {
    const first = words.slice(0, i).join(" ").length;
    if (first <= maxChars) best = i;
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

export function layoutBarGraph(g: Bar): BarGraphLayout {
  const { max, step } = g.scale;
  const stepCount = max / step;
  const texts: TextMark[] = [];
  const gridlines: Seg[] = [];
  const axes: Seg[] = [];
  const bars: Rect[] = [];
  const n = g.bars.length;

  if (g.orientation === "vertical") {
    const left = 40;
    const plotW = 300;
    const plotH = 150;
    const top = 42;
    const bottom = top + plotH;
    const width = left + plotW + 8;
    const slot = plotW / n;
    const barW = slot * 0.55;
    texts.push({ x: r2(left + plotW / 2), y: 11, text: g.title, anchor: "middle", size: 10.5, bold: true });
    texts.push({ x: 4, y: 30, text: g.valueAxisLabel, anchor: "start", size: 9 });
    for (let i = 0; i <= stepCount; i += 1) {
      const y = r2(bottom - (i / stepCount) * plotH);
      if (i > 0) gridlines.push({ x1: left, y1: y, x2: left + plotW, y2: y });
      texts.push({ x: left - 5, y: r2(y + 2.8), text: String(i * step), anchor: "end", size: BAR_FONT });
    }
    axes.push({ x1: left, y1: top, x2: left, y2: bottom }, { x1: left, y1: bottom, x2: left + plotW, y2: bottom });
    const maxChars = Math.floor((slot - 2) / (BAR_FONT * GLYPH_EM));
    g.bars.forEach((bar, i) => {
      const h = r2((bar.value / max) * plotH);
      const x = r2(left + i * slot + (slot - barW) / 2);
      bars.push({ x, y: r2(bottom - h), w: r2(barW), h });
      wrapLabel(bar.label, maxChars).forEach((line, li) => {
        texts.push({ x: r2(left + i * slot + slot / 2), y: bottom + 11 + li * 9.5, text: line, anchor: "middle", size: BAR_FONT });
      });
    });
    texts.push({ x: r2(left + plotW / 2), y: bottom + 34, text: g.categoryAxisLabel, anchor: "middle", size: 9 });
    return { width, height: bottom + 40, texts, gridlines, axes, bars };
  }

  const longest = Math.max(...g.bars.map((b) => b.label.length));
  const left = Math.min(120, Math.ceil(longest * BAR_FONT * GLYPH_EM) + 12);
  const plotW = 280;
  const slot = 26;
  const plotH = n * slot;
  const top = 42;
  const bottom = top + plotH;
  const width = left + plotW + 14;
  texts.push({ x: r2(width / 2), y: 11, text: g.title, anchor: "middle", size: 10.5, bold: true });
  texts.push({ x: 4, y: 30, text: g.categoryAxisLabel, anchor: "start", size: 9 });
  for (let i = 0; i <= stepCount; i += 1) {
    const x = r2(left + (i / stepCount) * plotW);
    if (i > 0) gridlines.push({ x1: x, y1: top, x2: x, y2: bottom });
    texts.push({ x, y: bottom + 11, text: String(i * step), anchor: "middle", size: BAR_FONT });
  }
  axes.push({ x1: left, y1: top, x2: left, y2: bottom }, { x1: left, y1: bottom, x2: left + plotW, y2: bottom });
  g.bars.forEach((bar, i) => {
    const w = r2((bar.value / max) * plotW);
    bars.push({ x: left, y: r2(top + i * slot + 5), w, h: slot - 10 });
    texts.push({ x: left - 6, y: r2(top + i * slot + slot / 2 + 2.8), text: bar.label, anchor: "end", size: BAR_FONT });
  });
  texts.push({ x: r2(left + plotW / 2), y: bottom + 25, text: g.valueAxisLabel, anchor: "middle", size: 9 });
  return { width, height: bottom + 32, texts, gridlines, axes, bars };
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export interface GridLayout {
  width: number;
  height: number;
  cell: number;
  shaded: Rect[];
  lines: Seg[];
  outline: string | null;
}

const GRID_PAD = 3;

export function layoutGrid(g: Grid): GridLayout {
  const cell = r2(g.cellMm * PT_PER_MM);
  const at = (v: number) => r2(GRID_PAD + v * cell);
  const shaded = (g.shaded ?? []).map(([c, r]) => ({ x: at(c), y: at(r), w: cell, h: cell }));
  const lines: Seg[] = [];
  for (let c = 0; c <= g.cols; c += 1) lines.push({ x1: at(c), y1: at(0), x2: at(c), y2: at(g.rows) });
  for (let r = 0; r <= g.rows; r += 1) lines.push({ x1: at(0), y1: at(r), x2: at(g.cols), y2: at(r) });
  const outline = g.outline ? g.outline.map(([x, y]) => `${at(x)},${at(y)}`).join(" ") : null;
  return { width: r2(2 * GRID_PAD + g.cols * cell), height: r2(2 * GRID_PAD + g.rows * cell), cell, shaded, lines, outline };
}

// ---------------------------------------------------------------------------
// Angle
// ---------------------------------------------------------------------------

export interface AngleLayout {
  width: number;
  height: number;
  arm1: Seg;
  arm2: Seg;
  /** SVG path for the small arc that marks the opening. */
  arc: string;
  /** SVG path for the right-angle square, or null. */
  rightMark: string | null;
  label: TextMark | null;
}

const ANGLE_PAD = 6;
const ANGLE_LABEL_BAND = 16;

export function layoutAngle(a: Angle): AngleLayout {
  const arm = r2(a.armLengthMm * PT_PER_MM);
  const rad = (a.degrees * Math.PI) / 180;
  // Exact for 90 so a right angle is drawn perfectly upright.
  const cos = a.degrees === 90 ? 0 : Math.cos(rad);
  const sin = Math.sin(rad);
  const minX = Math.min(0, arm * cos);
  const maxX = arm;
  const vx = r2(ANGLE_PAD - minX);
  const vy = r2(ANGLE_PAD + arm * sin);
  const width = r2(maxX - minX + 2 * ANGLE_PAD);
  const bodyHeight = r2(arm * sin + 2 * ANGLE_PAD);
  const arm1: Seg = { x1: vx, y1: vy, x2: r2(vx + arm), y2: vy };
  const arm2: Seg = { x1: vx, y1: vy, x2: r2(vx + arm * cos), y2: r2(vy - arm * sin) };
  const r = r2(arm * 0.28);
  const arc = `M ${r2(vx + r)} ${vy} A ${r} ${r} 0 0 0 ${r2(vx + r * cos)} ${r2(vy - r * sin)}`;
  const s = r2(Math.min(arm * 0.2, 14));
  const rightMark =
    a.showRightAngleMark === true && a.degrees === 90
      ? `M ${r2(vx + s)} ${vy} L ${r2(vx + s)} ${r2(vy - s)} L ${vx} ${r2(vy - s)}`
      : null;
  const label: TextMark | null = a.label
    ? { x: r2(vx + (minX + maxX) / 2), y: r2(bodyHeight + 11), text: a.label, anchor: "middle", size: 11, bold: true }
    : null;
  return { width, height: r2(bodyHeight + (a.label ? ANGLE_LABEL_BAND : 0)), arm1, arm2, arc, rightMark, label };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export const LINES_UNIT = r2(8 * PT_PER_MM);
const LINES_PAD = 18;

export interface LinesLayout {
  width: number;
  height: number;
  segments: (Seg & { label: TextMark | null })[];
  dots: { cx: number; cy: number }[];
  points: { cx: number; cy: number; label: TextMark }[];
}

export function layoutLines(l: Lines): LinesLayout {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of l.segments) {
    xs.push(s.from[0], s.to[0]);
    ys.push(s.from[1], s.to[1]);
  }
  for (const p of l.points ?? []) {
    xs.push(p.at[0]);
    ys.push(p.at[1]);
  }
  if (l.dotGrid) {
    xs.push(0, l.dotGrid.cols - 1);
    ys.push(0, l.dotGrid.rows - 1);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const px = (x: number) => r2(LINES_PAD + (x - minX) * LINES_UNIT);
  const py = (y: number) => r2(LINES_PAD + (maxY - y) * LINES_UNIT);

  const segments = l.segments.map((s) => {
    const x1 = px(s.from[0]);
    const y1 = py(s.from[1]);
    const x2 = px(s.to[0]);
    const y2 = py(s.to[1]);
    let label: TextMark | null = null;
    if (s.label) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      label = { x: r2(x2 + ux * 9), y: r2(y2 + uy * 9 + 3.5), text: s.label, anchor: "middle", size: 10, bold: true };
    }
    return { x1, y1, x2, y2, label };
  });

  const dots: { cx: number; cy: number }[] = [];
  if (l.dotGrid) {
    for (let y = 0; y < l.dotGrid.rows; y += 1) {
      for (let x = 0; x < l.dotGrid.cols; x += 1) dots.push({ cx: px(x), cy: py(y) });
    }
  }
  const points = (l.points ?? []).map((p) => ({
    cx: px(p.at[0]),
    cy: py(p.at[1]),
    label: { x: r2(px(p.at[0]) + 5), y: r2(py(p.at[1]) - 4), text: p.label, anchor: "start" as const, size: 10, bold: true },
  }));
  return {
    width: r2((maxX - minX) * LINES_UNIT + 2 * LINES_PAD),
    height: r2((maxY - minY) * LINES_UNIT + 2 * LINES_PAD),
    segments,
    dots,
    points,
  };
}
