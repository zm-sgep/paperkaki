"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  attemptReducer,
  attemptStorageKey,
  createAttemptState,
  restoreSnapshot,
  toSnapshot,
  type AttemptAction,
  type MockAttemptSnapshot,
  type MockAttemptState,
  type OptionId,
  type RestoredAttempt,
} from "./attempt-state";
import type { StrokeDocument } from "./stroke-model";
import { remainingSeconds } from "./timer";

/**
 * Holds everything a pupil has done in one mock attempt and keeps it safe.
 *
 * - Every change is written to `localStorage` (debounced, and straight away when the page is hidden
 *   or left) under a key for this attempt, and handed to the injected `onSave(snapshot)`. Sending
 *   the snapshot to the server is the caller's job and comes later.
 * - On the first render it restores from `initialSnapshot` (a server copy) or this device's copy,
 *   whichever was saved later. Read it only on the client: render the component that calls this
 *   after hydration (see `useIsClient`), so the server and the browser agree on the first paint.
 * - Elapsed time counts while the page is open, from the last saved value. It is saved with every
 *   change and every ten seconds, so a reload loses at most a few seconds.
 * - Failure to write (private window, full storage) never interrupts the paper.
 */

type SavedStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type UseMockAttemptStateOptions = {
  attemptId: string;
  questionIds: readonly string[];
  durationSeconds: number | null;
  onSave?: (snapshot: MockAttemptSnapshot) => void;
  /** Where to keep the device copy. Defaults to `window.localStorage`; pass null to turn it off. */
  storage?: SavedStorage | null;
  initialSnapshot?: MockAttemptSnapshot | null;
  debounceMs?: number;
  /** Stops the clock, for example once the paper is handed in. */
  clockStopped?: boolean;
};

const SAVE_CLOCK_EVERY_SECONDS = 10;

function defaultStorage(): SavedStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readSaved(storage: SavedStorage | null, attemptId: string): unknown {
  try {
    return storage?.getItem(attemptStorageKey(attemptId)) ?? null;
  } catch {
    return null;
  }
}

function newer(a: RestoredAttempt | null, b: RestoredAttempt | null): RestoredAttempt | null {
  if (!a || !b) return a ?? b;
  return Date.parse(b.savedAt) > Date.parse(a.savedAt) ? b : a;
}

export function useMockAttemptState(options: UseMockAttemptStateOptions) {
  const { attemptId, questionIds, durationSeconds, onSave, initialSnapshot, debounceMs = 500, clockStopped = false } = options;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  const [start] = useState(() => {
    const fromServer = initialSnapshot ? restoreSnapshot(initialSnapshot, attemptId, questionIds) : null;
    const fromDevice = restoreSnapshot(readSaved(storage, attemptId), attemptId, questionIds);
    const restored = newer(fromDevice, fromServer);
    return { restored, state: restored?.state ?? createAttemptState(questionIds), elapsed: restored?.elapsedSeconds ?? 0 };
  });

  const [state, setState] = useState<MockAttemptState>(start.state);
  const [elapsedSeconds, setElapsedSeconds] = useState(Math.floor(start.elapsed));

  // Handlers and the page-hide listener need the newest values without waiting for a render.
  const stateRef = useRef(start.state);
  const elapsedRef = useRef(start.elapsed);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  const storageRef = useRef(storage);
  const clockStoppedRef = useRef(clockStopped);

  useEffect(() => {
    onSaveRef.current = onSave;
    storageRef.current = storage;
    clockStoppedRef.current = clockStopped;
  });

  const persistLocal = useCallback((): MockAttemptSnapshot => {
    const snapshot = toSnapshot(stateRef.current, attemptId, elapsedRef.current);
    try {
      storageRef.current?.setItem(attemptStorageKey(attemptId), JSON.stringify(snapshot));
    } catch {
      // Storage full or blocked: keep going; the paper still works.
    }
    return snapshot;
  }, [attemptId]);

  const flush = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const snapshot = persistLocal();
    if (dirtyRef.current) {
      dirtyRef.current = false;
      onSaveRef.current?.(snapshot);
    }
  }, [persistLocal]);

  const dispatch = useCallback(
    (action: AttemptAction) => {
      const next = attemptReducer(stateRef.current, action);
      if (next === stateRef.current) return;
      stateRef.current = next;
      setState(next);
      dirtyRef.current = true;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flush, debounceMs);
    },
    [flush, debounceMs],
  );

  // The clock.
  useEffect(() => {
    if (clockStopped) return undefined;
    let last = Date.now();
    let ticks = 0;
    const tick = () => {
      const now = Date.now();
      elapsedRef.current += Math.max(0, now - last) / 1000;
      last = now;
      ticks += 1;
      setElapsedSeconds(Math.floor(elapsedRef.current));
      if (ticks % SAVE_CLOCK_EVERY_SECONDS === 0) persistLocal();
    };
    const timer = window.setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clockStopped, persistLocal]);

  // Save at once when the page is hidden, left or reloaded, and when this hook goes away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  const resumeFrom = useCallback(
    (snapshot: unknown): boolean => {
      const restored = restoreSnapshot(snapshot, attemptId, questionIds);
      if (!restored) return false;
      stateRef.current = restored.state;
      elapsedRef.current = restored.elapsedSeconds;
      setState(restored.state);
      setElapsedSeconds(Math.floor(restored.elapsedSeconds));
      dirtyRef.current = false;
      persistLocal();
      return true;
    },
    [attemptId, questionIds, persistLocal],
  );

  /** Forgets this device's copy, once the paper has been handed in. */
  const clearSaved = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;
    try {
      storageRef.current?.removeItem(attemptStorageKey(attemptId));
    } catch {
      // Nothing to clean up.
    }
  }, [attemptId]);

  const actions = {
    goTo: useCallback((index: number) => dispatch({ type: "goTo", index }), [dispatch]),
    next: useCallback(() => dispatch({ type: "next" }), [dispatch]),
    previous: useCallback(() => dispatch({ type: "previous" }), [dispatch]),
    select: useCallback((questionId: string, option: OptionId | null) => dispatch({ type: "select", questionId, option }), [dispatch]),
    type: useCallback((questionId: string, text: string) => dispatch({ type: "type", questionId, text }), [dispatch]),
    setStrokes: useCallback((questionId: string, strokes: StrokeDocument | null) => dispatch({ type: "setStrokes", questionId, strokes }), [dispatch]),
    toggleFlag: useCallback((questionId: string) => dispatch({ type: "toggleFlag", questionId }), [dispatch]),
  };

  return {
    state,
    currentQuestionId: state.questionIds[state.current],
    elapsedSeconds,
    remainingSeconds: durationSeconds === null ? null : remainingSeconds(durationSeconds, elapsedSeconds),
    /** True when this attempt was picked up from a saved copy rather than started fresh. */
    resumed: start.restored !== null,
    actions,
    resumeFrom,
    clearSaved,
    /** Writes the current state to the device and calls onSave if anything changed. */
    flush,
    /** The current snapshot, for submitting. */
    snapshot: useCallback((): MockAttemptSnapshot => toSnapshot(stateRef.current, attemptId, elapsedRef.current), [attemptId]),
  };
}
