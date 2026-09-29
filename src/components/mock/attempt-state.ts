import { z } from "zod";
import { STROKE_DOCUMENT_VERSION, deserialiseStrokes, serialiseStrokes, type StrokeDocument } from "./stroke-model";

/**
 * What the pupil has done so far in one mock attempt, as a pure reducer plus a saved snapshot
 * (docs/ARCHITECTURE.md section 10). It records answers, working, flags and position. It never
 * decides whether an answer is right: marking lives elsewhere and is never shown during the mock.
 */

export const ATTEMPT_SNAPSHOT_VERSION = 1;

export type OptionId = "A" | "B" | "C" | "D";
const OPTION_IDS = ["A", "B", "C", "D"] as const;

export type QuestionResponse = {
  selected?: OptionId;
  typed?: string;
  strokes?: StrokeDocument;
};

export type MockAttemptState = {
  questionIds: readonly string[];
  /** Index into `questionIds`. */
  current: number;
  responses: Readonly<Record<string, QuestionResponse>>;
  flagged: readonly string[];
};

export type MockAttemptSnapshot = {
  version: typeof ATTEMPT_SNAPSHOT_VERSION;
  attemptId: string;
  current: number;
  responses: Record<string, QuestionResponse>;
  flagged: string[];
  elapsedSeconds: number;
  savedAt: string;
};

export type AttemptAction =
  | { type: "goTo"; index: number }
  | { type: "next" }
  | { type: "previous" }
  | { type: "select"; questionId: string; option: OptionId | null }
  | { type: "type"; questionId: string; text: string }
  | { type: "setStrokes"; questionId: string; strokes: StrokeDocument | null }
  | { type: "toggleFlag"; questionId: string }
  | { type: "restore"; state: MockAttemptState };

export function createAttemptState(questionIds: readonly string[]): MockAttemptState {
  return { questionIds, current: 0, responses: {}, flagged: [] };
}

/** A question counts as answered when an option is chosen or something is typed. Working alone does not count. */
export function isAnswered(response: QuestionResponse | undefined): boolean {
  if (!response) return false;
  return response.selected !== undefined || (response.typed !== undefined && response.typed.trim() !== "");
}

export function hasStrokes(response: QuestionResponse | undefined): boolean {
  return (response?.strokes?.strokes.length ?? 0) > 0;
}

function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function withResponse(state: MockAttemptState, questionId: string, patch: (r: QuestionResponse) => QuestionResponse): MockAttemptState {
  if (!state.questionIds.includes(questionId)) return state;
  const next = patch(state.responses[questionId] ?? {});
  const responses = { ...state.responses };
  if (Object.keys(next).length === 0) delete responses[questionId];
  else responses[questionId] = next;
  return { ...state, responses };
}

export function attemptReducer(state: MockAttemptState, action: AttemptAction): MockAttemptState {
  const last = state.questionIds.length - 1;
  switch (action.type) {
    case "goTo": {
      const index = Math.min(last, Math.max(0, Math.trunc(action.index)));
      return index === state.current || Number.isNaN(index) ? state : { ...state, current: index };
    }
    case "next":
      return state.current >= last ? state : { ...state, current: state.current + 1 };
    case "previous":
      return state.current <= 0 ? state : { ...state, current: state.current - 1 };
    case "select":
      return withResponse(state, action.questionId, (r) => (action.option === null ? without(r, "selected") : { ...r, selected: action.option }));
    case "type":
      return withResponse(state, action.questionId, (r) => (action.text === "" ? without(r, "typed") : { ...r, typed: action.text }));
    case "setStrokes":
      return withResponse(state, action.questionId, (r) =>
        action.strokes === null || action.strokes.strokes.length === 0 ? without(r, "strokes") : { ...r, strokes: action.strokes },
      );
    case "toggleFlag": {
      if (!state.questionIds.includes(action.questionId)) return state;
      return {
        ...state,
        flagged: state.flagged.includes(action.questionId)
          ? state.flagged.filter((id) => id !== action.questionId)
          : [...state.flagged, action.questionId],
      };
    }
    case "restore":
      return action.state;
  }
}

// ---------------------------------------------------------------------------
// Snapshot: what is saved to the device now and sent to the server later
// ---------------------------------------------------------------------------

export function toSnapshot(state: MockAttemptState, attemptId: string, elapsedSeconds: number, now: Date = new Date()): MockAttemptSnapshot {
  return {
    version: ATTEMPT_SNAPSHOT_VERSION,
    attemptId,
    current: state.current,
    responses: { ...state.responses },
    flagged: [...state.flagged],
    elapsedSeconds: Math.max(0, Math.round(elapsedSeconds)),
    savedAt: now.toISOString(),
  };
}

const SnapshotSchema = z.object({
  version: z.literal(ATTEMPT_SNAPSHOT_VERSION),
  attemptId: z.string().min(1),
  current: z.number().int().min(0),
  responses: z.record(
    z.string(),
    z.object({
      selected: z.enum(OPTION_IDS).optional(),
      typed: z.string().max(500).optional(),
      strokes: z
        .object({ version: z.literal(STROKE_DOCUMENT_VERSION), strokes: z.array(z.unknown()) })
        .passthrough()
        .optional(),
    }),
  ),
  flagged: z.array(z.string()),
  elapsedSeconds: z.number().finite().min(0),
  savedAt: z.string(),
});

export type RestoredAttempt = { state: MockAttemptState; elapsedSeconds: number };

/**
 * Turns a saved snapshot (an object or JSON text) back into state for THIS paper. Returns null when
 * it is not readable, belongs to another attempt, or has a version this code does not know, so the
 * caller starts fresh rather than showing someone else's answers. Answers for questions that are no
 * longer in the paper are dropped, and the position is kept in range.
 */
export function restoreSnapshot(raw: unknown, attemptId: string, questionIds: readonly string[]): RestoredAttempt | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = SnapshotSchema.safeParse(value);
  if (!parsed.success || parsed.data.attemptId !== attemptId) return null;
  const known = new Set(questionIds);
  const responses: Record<string, QuestionResponse> = {};
  for (const [id, response] of Object.entries(parsed.data.responses)) {
    if (!known.has(id)) continue;
    const { strokes: rawStrokes, ...rest } = response;
    const strokes = rawStrokes === undefined ? null : deserialiseStrokes(rawStrokes);
    responses[id] = strokes && strokes.length > 0 ? { ...rest, strokes: serialiseStrokes(strokes) } : rest;
  }
  return {
    state: {
      questionIds,
      current: Math.min(Math.max(0, questionIds.length - 1), parsed.data.current),
      responses,
      flagged: parsed.data.flagged.filter((id) => known.has(id)),
    },
    elapsedSeconds: parsed.data.elapsedSeconds,
  };
}

export const attemptStorageKey = (attemptId: string): string => `paperkaki.mock.attempt.${attemptId}`;

// ---------------------------------------------------------------------------
// Question list for the navigator and the submit review
// ---------------------------------------------------------------------------

export type QuestionStatus = {
  id: string;
  /** 1-based number shown to the pupil. */
  number: number;
  answered: boolean;
  flagged: boolean;
};

export function questionStatuses(state: MockAttemptState): QuestionStatus[] {
  return state.questionIds.map((id, i) => ({
    id,
    number: i + 1,
    answered: isAnswered(state.responses[id]),
    flagged: state.flagged.includes(id),
  }));
}
