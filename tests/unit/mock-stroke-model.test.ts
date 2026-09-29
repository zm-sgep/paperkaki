import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY,
  MAX_POINTS_PER_PAGE,
  MAX_STROKES_PER_PAGE,
  MIN_POINT_DISTANCE,
  canRedo,
  canUndo,
  countPoints,
  createStrokeState,
  deserialiseStrokes,
  hitTestStrokes,
  isFull,
  normaliseStroke,
  serialiseStrokes,
  shouldKeepPoint,
  strokeReducer,
  thinPoints,
  type Stroke,
  type StrokePoint,
  type StrokeState,
} from "@/components/mock/stroke-model";

const line = (id: string, y = 0.5, n = 5): Stroke => ({
  id,
  tool: "pen",
  width: 0.003,
  points: Array.from({ length: n }, (_, i): StrokePoint => [Math.round((0.1 + i * 0.05) * 1e4) / 1e4, y, 0.5, i * 10]),
});

const run = (actions: Parameters<typeof strokeReducer>[1][], from: StrokeState = createStrokeState()) =>
  actions.reduce(strokeReducer, from);

describe("size guard", () => {
  it("keeps the first point and drops points closer than the threshold", () => {
    const a: StrokePoint = [0.5, 0.5, 0.5, 0];
    expect(shouldKeepPoint(undefined, a)).toBe(true);
    expect(shouldKeepPoint(a, [0.5 + MIN_POINT_DISTANCE / 2, 0.5, 0.5, 5])).toBe(false);
    expect(shouldKeepPoint(a, [0.5 + MIN_POINT_DISTANCE * 2, 0.5, 0.5, 5])).toBe(true);
  });

  it("thins a dense run but keeps both ends", () => {
    const dense: StrokePoint[] = Array.from({ length: 100 }, (_, i) => [0.1 + i * 0.0001, 0.2, 0.5, i]);
    const thin = thinPoints(dense);
    expect(thin.length).toBeLessThan(20);
    expect(thin[0]).toEqual(dense[0]);
    expect(thin[thin.length - 1]).toEqual(dense[99]);
  });

  it("keeps a single tap as one dot", () => {
    expect(thinPoints([[0.4, 0.4, 0.5, 0]])).toHaveLength(1);
  });

  it("clamps and rounds when a stroke is stored", () => {
    const stroke = normaliseStroke({ id: "a", tool: "pen", width: 0.0031234567, points: [[-0.2, 1.4, 1.7, 12.6], [0.123456, 0.5, 0.456, 30]] });
    expect(stroke.points[0]).toEqual([0, 1, 1, 13]);
    expect(stroke.points[1]).toEqual([0.1235, 0.5, 0.46, 30]);
    expect(stroke.width).toBe(0.00312);
  });

  it("caps the number of points on a page and truncates the stroke that crosses the cap", () => {
    const big = (id: string, n: number): Stroke => ({
      id,
      tool: "pen",
      width: 0.003,
      points: Array.from({ length: n }, (_, i): StrokePoint => [(i % 500) / 500, Math.floor(i / 500) / 100, 0.5, i]),
    });
    let state = strokeReducer(createStrokeState(), { type: "add", stroke: big("a", MAX_POINTS_PER_PAGE - 10) });
    state = strokeReducer(state, { type: "add", stroke: big("b", 500) });
    expect(countPoints(state.present)).toBe(MAX_POINTS_PER_PAGE);
    expect(isFull(state.present)).toBe(true);
    const after = strokeReducer(state, { type: "add", stroke: line("c") });
    expect(after).toBe(state);
  });

  it("caps the number of strokes on a page", () => {
    let state = createStrokeState();
    for (let i = 0; i < MAX_STROKES_PER_PAGE + 5; i += 1) {
      state = strokeReducer(state, { type: "add", stroke: line(`s${i}`, (i % 90) / 100 + 0.05, 2) });
    }
    expect(state.present).toHaveLength(MAX_STROKES_PER_PAGE);
    expect(isFull(state.present)).toBe(true);
  });
});

describe("stroke reducer", () => {
  it("adds strokes and supports undo and redo", () => {
    let state = run([{ type: "add", stroke: line("a") }, { type: "add", stroke: line("b", 0.6) }]);
    expect(state.present.map((s) => s.id)).toEqual(["a", "b"]);
    expect(canUndo(state)).toBe(true);
    state = run([{ type: "undo" }], state);
    expect(state.present.map((s) => s.id)).toEqual(["a"]);
    expect(canRedo(state)).toBe(true);
    state = run([{ type: "redo" }], state);
    expect(state.present.map((s) => s.id)).toEqual(["a", "b"]);
    expect(canRedo(state)).toBe(false);
  });

  it("drops the redo history when something new is drawn", () => {
    let state = run([{ type: "add", stroke: line("a") }, { type: "undo" }]);
    expect(canRedo(state)).toBe(true);
    state = run([{ type: "add", stroke: line("b") }], state);
    expect(canRedo(state)).toBe(false);
  });

  it("erases whole strokes as one undoable step", () => {
    let state = run([{ type: "add", stroke: line("a") }, { type: "add", stroke: line("b", 0.6) }, { type: "add", stroke: line("c", 0.7) }]);
    state = run([{ type: "erase", ids: ["a", "c"] }], state);
    expect(state.present.map((s) => s.id)).toEqual(["b"]);
    state = run([{ type: "undo" }], state);
    expect(state.present.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores an erase that matches nothing, an empty clear and an undo with no history", () => {
    const state = run([{ type: "add", stroke: line("a") }]);
    expect(strokeReducer(state, { type: "erase", ids: ["zzz"] })).toBe(state);
    const empty = createStrokeState();
    expect(strokeReducer(empty, { type: "clear" })).toBe(empty);
    expect(strokeReducer(empty, { type: "undo" })).toBe(empty);
    expect(strokeReducer(empty, { type: "redo" })).toBe(empty);
  });

  it("clears everything and can undo the clear", () => {
    let state = run([{ type: "add", stroke: line("a") }, { type: "clear" }]);
    expect(state.present).toEqual([]);
    state = run([{ type: "undo" }], state);
    expect(state.present).toHaveLength(1);
  });

  it("keeps a bounded undo history", () => {
    let state = createStrokeState();
    for (let i = 0; i < MAX_HISTORY + 20; i += 1) {
      state = strokeReducer(state, { type: "add", stroke: line(`s${i}`, (i % 90) / 100 + 0.05, 2) });
    }
    expect(state.past).toHaveLength(MAX_HISTORY);
  });

  it("load replaces the strokes and forgets history", () => {
    const state = run([{ type: "add", stroke: line("a") }, { type: "load", strokes: [line("z")] }]);
    expect(state.present.map((s) => s.id)).toEqual(["z"]);
    expect(canUndo(state)).toBe(false);
  });
});

describe("hitTestStrokes", () => {
  const strokes = [line("near", 0.5), line("far", 0.9), { ...line("eraser", 0.5), tool: "eraser" as const }];
  const size = { width: 1000, height: 500 };

  it("finds the pen strokes under the eraser and ignores the rest", () => {
    expect(hitTestStrokes(strokes, 0.2, 0.5, 10, size)).toEqual(["near"]);
    expect(hitTestStrokes(strokes, 0.2, 0.7, 10, size)).toEqual([]);
  });

  it("measures in pixels, so the same page distance is a bigger miss on a taller area", () => {
    // 0.02 of the height is 10px on a 500px area, 20px on a 1000px area.
    expect(hitTestStrokes(strokes, 0.2, 0.52, 12, size)).toEqual(["near"]);
    expect(hitTestStrokes(strokes, 0.2, 0.52, 12, { width: 1000, height: 1000 })).toEqual([]);
  });

  it("hits a single-dot stroke", () => {
    const dot: Stroke = { id: "dot", tool: "pen", width: 0.003, points: [[0.3, 0.3, 0.5, 0]] };
    expect(hitTestStrokes([dot], 0.301, 0.3, 8, size)).toEqual(["dot"]);
  });
});

describe("serialising", () => {
  it("round-trips strokes through a versioned document and through JSON text", () => {
    const strokes = [line("a"), line("b", 0.6)];
    const doc = serialiseStrokes(strokes);
    expect(doc.version).toBe(1);
    expect(deserialiseStrokes(doc)).toEqual(strokes);
    expect(deserialiseStrokes(JSON.stringify(doc))).toEqual(strokes);
  });

  it("rejects an unknown version, bad shapes and text that is not JSON", () => {
    expect(deserialiseStrokes({ version: 2, strokes: [] })).toBeNull();
    expect(deserialiseStrokes({ version: 1 })).toBeNull();
    expect(deserialiseStrokes({ version: 1, strokes: [{ id: "a", tool: "brush", width: 0.1, points: [] }] })).toBeNull();
    expect(deserialiseStrokes({ version: 1, strokes: [{ id: "a", tool: "pen", width: 0.1, points: [[0, 0, 0]] }] })).toBeNull();
    expect(deserialiseStrokes("not json")).toBeNull();
    expect(deserialiseStrokes(null)).toBeNull();
  });

  it("re-applies the size guard to what it reads, and skips strokes with no points", () => {
    const oversized = {
      version: 1,
      strokes: [
        { id: "empty", tool: "pen", width: 0.003, points: [] },
        { id: "wild", tool: "pen", width: 0.003, points: [[-4, 9, 3, 0], [0.5, 0.5, 0.5, 10]] },
      ],
    };
    const read = deserialiseStrokes(oversized) as Stroke[];
    expect(read.map((s) => s.id)).toEqual(["wild"]);
    expect(read[0]?.points[0]).toEqual([0, 1, 1, 0]);
  });
});
