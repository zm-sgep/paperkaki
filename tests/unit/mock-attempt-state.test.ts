import { describe, expect, it } from "vitest";
import {
  attemptReducer,
  attemptStorageKey,
  createAttemptState,
  hasStrokes,
  isAnswered,
  questionStatuses,
  restoreSnapshot,
  toSnapshot,
  type AttemptAction,
} from "@/components/mock/attempt-state";
import { serialiseStrokes, type Stroke } from "@/components/mock/stroke-model";

const ids = ["q1", "q2", "q3"];
const run = (actions: AttemptAction[], from = createAttemptState(ids)) => actions.reduce(attemptReducer, from);
const stroke: Stroke = { id: "s1", tool: "pen", width: 0.003, points: [[0.1, 0.1, 0.5, 0], [0.2, 0.2, 0.5, 10]] };

describe("navigation", () => {
  it("moves next and previous but stays within the paper", () => {
    expect(run([{ type: "previous" }]).current).toBe(0);
    expect(run([{ type: "next" }, { type: "next" }, { type: "next" }, { type: "next" }]).current).toBe(2);
    expect(run([{ type: "goTo", index: 1 }]).current).toBe(1);
    expect(run([{ type: "goTo", index: 99 }]).current).toBe(2);
    expect(run([{ type: "goTo", index: -4 }]).current).toBe(0);
  });
});

describe("answers", () => {
  it("records a chosen option and lets it change or be cleared", () => {
    let s = run([{ type: "select", questionId: "q1", option: "B" }]);
    expect(s.responses["q1"]?.selected).toBe("B");
    s = run([{ type: "select", questionId: "q1", option: "D" }], s);
    expect(s.responses["q1"]?.selected).toBe("D");
    s = run([{ type: "select", questionId: "q1", option: null }], s);
    expect(s.responses["q1"]).toBeUndefined();
  });

  it("records typed answers, and an emptied box is no answer", () => {
    let s = run([{ type: "type", questionId: "q2", text: "340" }]);
    expect(isAnswered(s.responses["q2"])).toBe(true);
    s = run([{ type: "type", questionId: "q2", text: "   " }], s);
    expect(isAnswered(s.responses["q2"])).toBe(false);
    s = run([{ type: "type", questionId: "q2", text: "" }], s);
    expect(s.responses["q2"]).toBeUndefined();
  });

  it("ignores answers for questions that are not in the paper", () => {
    const s = createAttemptState(ids);
    expect(attemptReducer(s, { type: "type", questionId: "nope", text: "1" })).toBe(s);
    expect(attemptReducer(s, { type: "toggleFlag", questionId: "nope" })).toBe(s);
  });

  it("keeps working separate from the answer: strokes alone do not answer a question", () => {
    const s = run([{ type: "setStrokes", questionId: "q3", strokes: serialiseStrokes([stroke]) }]);
    expect(hasStrokes(s.responses["q3"])).toBe(true);
    expect(isAnswered(s.responses["q3"])).toBe(false);
    const cleared = run([{ type: "setStrokes", questionId: "q3", strokes: serialiseStrokes([]) }], s);
    expect(cleared.responses["q3"]).toBeUndefined();
  });

  it("toggles flags on and off", () => {
    let s = run([{ type: "toggleFlag", questionId: "q2" }]);
    expect(s.flagged).toEqual(["q2"]);
    s = run([{ type: "toggleFlag", questionId: "q2" }], s);
    expect(s.flagged).toEqual([]);
  });

  it("lists every question with its answered and flagged status", () => {
    const s = run([
      { type: "select", questionId: "q1", option: "A" },
      { type: "toggleFlag", questionId: "q3" },
    ]);
    expect(questionStatuses(s)).toEqual([
      { id: "q1", number: 1, answered: true, flagged: false },
      { id: "q2", number: 2, answered: false, flagged: false },
      { id: "q3", number: 3, answered: false, flagged: true },
    ]);
  });
});

describe("snapshot and restore", () => {
  const filled = run([
    { type: "select", questionId: "q1", option: "C" },
    { type: "type", questionId: "q2", text: "3 1/2" },
    { type: "setStrokes", questionId: "q2", strokes: serialiseStrokes([stroke]) },
    { type: "toggleFlag", questionId: "q3" },
    { type: "goTo", index: 1 },
  ]);

  it("round-trips through a JSON snapshot with position, flags and elapsed time", () => {
    const snapshot = toSnapshot(filled, "att-1", 754.4, new Date("2026-05-01T02:00:00Z"));
    expect(snapshot).toMatchObject({ version: 1, attemptId: "att-1", current: 1, elapsedSeconds: 754, savedAt: "2026-05-01T02:00:00.000Z" });
    const restored = restoreSnapshot(JSON.stringify(snapshot), "att-1", ids);
    expect(restored?.state).toEqual(filled);
    expect(restored?.elapsedSeconds).toBe(754);
  });

  it("refuses a snapshot from another attempt, another version or damaged text", () => {
    const snapshot = toSnapshot(filled, "att-1", 10);
    expect(restoreSnapshot(snapshot, "att-2", ids)).toBeNull();
    expect(restoreSnapshot({ ...snapshot, version: 9 }, "att-1", ids)).toBeNull();
    expect(restoreSnapshot("{oops", "att-1", ids)).toBeNull();
    expect(restoreSnapshot({ ...snapshot, elapsedSeconds: -5 }, "att-1", ids)).toBeNull();
    expect(restoreSnapshot(null, "att-1", ids)).toBeNull();
  });

  it("drops answers for questions no longer in the paper and keeps the position in range", () => {
    const snapshot = { ...toSnapshot(filled, "att-1", 10), current: 40 };
    const restored = restoreSnapshot(snapshot, "att-1", ["q1", "q2"]);
    expect(restored?.state.current).toBe(1);
    expect(Object.keys(restored?.state.responses ?? {}).sort()).toEqual(["q1", "q2"]);
    expect(restored?.state.flagged).toEqual([]);
  });

  it("starts working from blank when saved strokes are unreadable", () => {
    const snapshot = toSnapshot(filled, "att-1", 10);
    const damaged = { ...snapshot, responses: { ...snapshot.responses, q2: { typed: "3 1/2", strokes: { version: 1, strokes: [{ nonsense: true }] } } } };
    const restored = restoreSnapshot(damaged, "att-1", ids);
    expect(restored?.state.responses["q2"]).toEqual({ typed: "3 1/2" });
  });

  it("keys local storage by attempt", () => {
    expect(attemptStorageKey("abc")).toBe("paperkaki.mock.attempt.abc");
  });
});
