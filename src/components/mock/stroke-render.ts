import type { Stroke } from "./stroke-model";

/**
 * Draws strokes onto a 2D canvas context. Coordinates are page-relative (stroke-model.ts), so the
 * caller passes the drawing size in CSS pixels and sets any device-pixel scaling on the context.
 *
 * A stroke is drawn as a chain of quadratic curves through the midpoints between samples, which
 * looks smooth at Apple Pencil sampling rates without any curve fitting. Pressure varies the line
 * width a little; a finger or mouse draws at a steady width.
 */

export const INK_COLOUR = "#1f2933";
const MIN_LINE_PX = 1.4;
const ERASER_LINE_PX = 24;

type Ctx = CanvasRenderingContext2D;

function lineWidthPx(stroke: Stroke, pressure: number, drawingWidth: number): number {
  if (stroke.tool === "eraser") return ERASER_LINE_PX;
  return Math.max(MIN_LINE_PX, stroke.width * drawingWidth * (0.55 + 0.9 * pressure));
}

/**
 * Draws the curve segments `from`..end of one stroke. Segment k runs from the midpoint before
 * sample k to the midpoint after it, bending towards the sample. Drawing from `n - 2` while a
 * stroke grows repaints only its tail.
 */
export function drawStroke(ctx: Ctx, stroke: Stroke, width: number, height: number, from = 0): void {
  const pts = stroke.points;
  const n = pts.length;
  if (n === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = INK_COLOUR;
  ctx.fillStyle = INK_COLOUR;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const px = (i: number) => (pts[i]?.[0] ?? 0) * width;
  const py = (i: number) => (pts[i]?.[1] ?? 0) * height;
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(px(0), py(0), lineWidthPx(stroke, pts[0]?.[2] ?? 0.5, width) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  for (let k = Math.max(0, from); k < n; k += 1) {
    const startX = k === 0 ? px(0) : (px(k - 1) + px(k)) / 2;
    const startY = k === 0 ? py(0) : (py(k - 1) + py(k)) / 2;
    const endX = k === n - 1 ? px(k) : (px(k) + px(k + 1)) / 2;
    const endY = k === n - 1 ? py(k) : (py(k) + py(k + 1)) / 2;
    ctx.lineWidth = lineWidthPx(stroke, pts[k]?.[2] ?? 0.5, width);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(px(k), py(k), endX, endY);
    ctx.stroke();
  }
  ctx.restore();
}

/** Clears the drawing and repaints every stroke except the hidden ones (strokes about to be erased). */
export function drawAll(ctx: Ctx, strokes: readonly Stroke[], width: number, height: number, hidden?: ReadonlySet<string>): void {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    if (!hidden?.has(stroke.id)) drawStroke(ctx, stroke, width, height);
  }
}
