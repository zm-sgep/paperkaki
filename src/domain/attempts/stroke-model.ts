import { z } from "zod";

/**
 * Handwriting strokes as plain vector data (docs/ARCHITECTURE.md section 10).
 *
 * Coordinates are page-relative: x and y run 0..1 across the width and height of the writing
 * area, so a drawing survives a resize or a rotation of the iPad. `width` is the pen width as a
 * fraction of the writing-area width. Each point is [x, y, pressure, t]; pressure runs 0..1 and t
 * is milliseconds since the stroke started.
 *
 * Pure and framework-free: the canvas component owns pointer events and pixels, this file owns the
 * data, the undo history, the size guard and the saved format.
 */

export type StrokeTool = "pen" | "eraser";
export type StrokePoint = readonly [x: number, y: number, pressure: number, t: number];

export type Stroke = {
  readonly id: string;
  readonly tool: StrokeTool;
  readonly points: readonly StrokePoint[];
  readonly width: number;
};

// ---------------------------------------------------------------------------
// Size guard
// ---------------------------------------------------------------------------

/** Points closer than this (in page-relative units, about 1px on an iPad) add nothing visible. */
export const MIN_POINT_DISTANCE = 0.0012;
/** One writing area never holds more than this many points, which keeps a saved page near 300 KB. */
export const MAX_POINTS_PER_PAGE = 12_000;
export const MAX_STROKES_PER_PAGE = 400;
/** Undo steps kept in memory. History is not saved. */
export const MAX_HISTORY = 50;

export const PEN_WIDTH = 0.0032;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

const distance = (a: StrokePoint, b: StrokePoint): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Would this point add anything after `previous`? The first point of a stroke is always kept. */
export function shouldKeepPoint(
  previous: StrokePoint | undefined,
  next: StrokePoint,
  minDistance: number = MIN_POINT_DISTANCE,
): boolean {
  return previous === undefined || distance(previous, next) >= minDistance;
}

/** Drops points that are too close to the last kept one. First and last points always stay. */
export function thinPoints(points: readonly StrokePoint[], minDistance: number = MIN_POINT_DISTANCE): StrokePoint[] {
  const kept: StrokePoint[] = [];
  points.forEach((point, i) => {
    const last = kept[kept.length - 1];
    if (i === points.length - 1 && i > 0) {
      // Keep the true end of the stroke, replacing a near-duplicate rather than adding one.
      if (last !== undefined && distance(last, point) < minDistance && kept.length > 1) kept.pop();
      kept.push(point);
    } else if (shouldKeepPoint(last, point, minDistance)) {
      kept.push(point);
    }
  });
  return kept;
}

/** Clamps, rounds and thins one stroke so it is safe to store. */
export function normaliseStroke(stroke: Stroke): Stroke {
  const points = thinPoints(
    stroke.points.map(
      ([x, y, pressure, t]): StrokePoint => [round(clamp01(x), 4), round(clamp01(y), 4), round(clamp01(pressure), 2), Math.max(0, Math.round(t))],
    ),
  );
  return { id: stroke.id, tool: stroke.tool, width: round(stroke.width, 5), points };
}

export function countPoints(strokes: readonly Stroke[]): number {
  return strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

/** True when nothing more can be added; the canvas tells the child to erase or clear some working. */
export function isFull(strokes: readonly Stroke[]): boolean {
  return strokes.length >= MAX_STROKES_PER_PAGE || countPoints(strokes) >= MAX_POINTS_PER_PAGE;
}

// ---------------------------------------------------------------------------
// State and reducer (add, erase, undo, redo, clear)
// ---------------------------------------------------------------------------

export type StrokeState = {
  readonly present: readonly Stroke[];
  readonly past: readonly (readonly Stroke[])[];
  readonly future: readonly (readonly Stroke[])[];
};

export type StrokeAction =
  | { type: "add"; stroke: Stroke }
  | { type: "erase"; ids: readonly string[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  /** Replaces everything with saved strokes and forgets the history. */
  | { type: "load"; strokes: readonly Stroke[] };

export function createStrokeState(strokes: readonly Stroke[] = []): StrokeState {
  return { present: strokes, past: [], future: [] };
}

export const canUndo = (state: StrokeState): boolean => state.past.length > 0;
export const canRedo = (state: StrokeState): boolean => state.future.length > 0;

/** Moves to `next` as one undoable step. */
function commit(state: StrokeState, next: readonly Stroke[]): StrokeState {
  return { present: next, past: [...state.past, state.present].slice(-MAX_HISTORY), future: [] };
}

export function strokeReducer(state: StrokeState, action: StrokeAction): StrokeState {
  switch (action.type) {
    case "add": {
      if (state.present.length >= MAX_STROKES_PER_PAGE) return state;
      const room = MAX_POINTS_PER_PAGE - countPoints(state.present);
      if (room <= 0) return state;
      const stroke = normaliseStroke(action.stroke);
      if (stroke.points.length === 0) return state;
      const fitted = stroke.points.length > room ? { ...stroke, points: stroke.points.slice(0, room) } : stroke;
      return commit(state, [...state.present, fitted]);
    }
    case "erase": {
      const ids = new Set(action.ids);
      const next = state.present.filter((stroke) => !ids.has(stroke.id));
      return next.length === state.present.length ? state : commit(state, next);
    }
    case "clear":
      return state.present.length === 0 ? state : commit(state, []);
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state;
      return { present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future] };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return { present: next, past: [...state.past, state.present], future: rest };
    }
    case "load":
      return createStrokeState(action.strokes);
  }
}

// ---------------------------------------------------------------------------
// Erasing: which strokes does a touch of the eraser reach?
// ---------------------------------------------------------------------------

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ids of the pen strokes within `radiusPx` of the point (x, y), all in page-relative units except
 * the radius. `size` is the writing area in pixels, so a distance is measured in real pixels and a
 * wide, short area does not make the eraser lopsided.
 */
export function hitTestStrokes(
  strokes: readonly Stroke[],
  x: number,
  y: number,
  radiusPx: number,
  size: { width: number; height: number },
): string[] {
  const px = x * size.width;
  const py = y * size.height;
  const hits: string[] = [];
  for (const stroke of strokes) {
    if (stroke.tool !== "pen") continue;
    const reach = radiusPx + (stroke.width * size.width) / 2;
    const [first] = stroke.points;
    if (first === undefined) continue;
    let hit = stroke.points.length === 1 && Math.hypot(px - first[0] * size.width, py - first[1] * size.height) <= reach;
    for (let i = 1; i < stroke.points.length && !hit; i += 1) {
      const a = stroke.points[i - 1] as StrokePoint;
      const b = stroke.points[i] as StrokePoint;
      hit = distanceToSegment(px, py, a[0] * size.width, a[1] * size.height, b[0] * size.width, b[1] * size.height) <= reach;
    }
    if (hit) hits.push(stroke.id);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Saved format
// ---------------------------------------------------------------------------

export const STROKE_DOCUMENT_VERSION = 1;

export type StrokeDocument = {
  readonly version: typeof STROKE_DOCUMENT_VERSION;
  /**
   * Width divided by height of the writing area when it was drawn. Strokes are page-relative, so
   * this is what lets a snapshot be redrawn at the shape the child saw. Optional: older saves lack it.
   */
  readonly aspect?: number;
  readonly strokes: readonly {
    readonly id: string;
    readonly tool: StrokeTool;
    readonly width: number;
    readonly points: readonly (readonly [number, number, number, number])[];
  }[];
};

const StrokeDocumentSchema = z.object({
  version: z.literal(STROKE_DOCUMENT_VERSION),
  aspect: z.number().finite().min(0.2).max(8).optional(),
  strokes: z.array(
    z.object({
      id: z.string().min(1).max(64),
      tool: z.enum(["pen", "eraser"]),
      width: z.number().finite().min(0).max(1),
      points: z.array(z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])),
    }),
  ),
});

/** The versioned, JSON-safe form of a set of strokes. `aspect` is the writing area's width over height, when known. */
export function serialiseStrokes(strokes: readonly Stroke[], aspect?: number): StrokeDocument {
  const validAspect = aspect !== undefined && Number.isFinite(aspect) && aspect >= 0.2 && aspect <= 8 ? round(aspect, 3) : undefined;
  return {
    version: STROKE_DOCUMENT_VERSION,
    ...(validAspect !== undefined ? { aspect: validAspect } : {}),
    strokes: strokes.map((stroke) => ({
      id: stroke.id,
      tool: stroke.tool,
      width: stroke.width,
      points: stroke.points.map(([x, y, pressure, t]) => [x, y, pressure, t] as const),
    })),
  };
}

/**
 * Reads a saved document (an object or its JSON text). Returns null when it is not a document this
 * version understands, so a caller starts with a blank page instead of crashing. Strokes are
 * clamped and thinned again, and the page caps are re-applied, so a hand-edited or oversized file
 * cannot slow the canvas down.
 */
export function deserialiseStrokes(raw: unknown): Stroke[] | null {
  return readStrokeDocument(raw)?.strokes ?? null;
}

/** Like `deserialiseStrokes`, and also returns the writing area's aspect ratio when the save has one. */
export function readStrokeDocument(raw: unknown): { strokes: Stroke[]; aspect?: number } | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = StrokeDocumentSchema.safeParse(value);
  if (!parsed.success) return null;
  const strokes: Stroke[] = [];
  let points = 0;
  for (const saved of parsed.data.strokes) {
    if (strokes.length >= MAX_STROKES_PER_PAGE || points >= MAX_POINTS_PER_PAGE) break;
    const stroke = normaliseStroke({ id: saved.id, tool: saved.tool, width: saved.width, points: saved.points });
    if (stroke.points.length === 0) continue;
    const fitted = points + stroke.points.length > MAX_POINTS_PER_PAGE ? { ...stroke, points: stroke.points.slice(0, MAX_POINTS_PER_PAGE - points) } : stroke;
    strokes.push(fitted);
    points += fitted.points.length;
  }
  return parsed.data.aspect === undefined ? { strokes } : { strokes, aspect: parsed.data.aspect };
}
