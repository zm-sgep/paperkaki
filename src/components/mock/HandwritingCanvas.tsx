"use client";

import { useCallback, useEffect, useImperativeHandle, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { effectivePressure, pointerKind, shouldAcceptPointer, type PenActivity, type PointerKind } from "./pointer-policy";
import { drawAll, drawStroke } from "./stroke-render";
import {
  PEN_WIDTH,
  canRedo,
  canUndo,
  createStrokeState,
  deserialiseStrokes,
  hitTestStrokes,
  isFull,
  shouldKeepPoint,
  strokeReducer,
  type Stroke,
  type StrokeDocument,
  type StrokePoint,
  type StrokeTool,
} from "./stroke-model";

/**
 * The working area: draw with Apple Pencil (pressure aware) or a finger, erase whole strokes,
 * undo, redo and clear. The controls sit in a row under the writing surface, never on top of it.
 *
 * Only the canvas has `touch-action: none`, so the page around it still scrolls. When a pen is in
 * use a resting palm is ignored (pointer-policy.ts); a finger draws when no pen has been used.
 */

export type HandwritingCanvasHandle = {
  /** The strokes as they are now (committed strokes only). */
  getStrokes: () => readonly Stroke[];
  /** A white-background PNG of the working, for the marking snapshot. Null when there is nothing to draw on yet. */
  toPngBlob: () => Promise<Blob | null>;
  /** Sends any waiting change to `onChange` straight away. */
  flush: () => void;
};

export type HandwritingCanvasProps = {
  /** Saved working to start from. Read once when the canvas mounts; give the canvas a `key` per question. */
  initialStrokes?: StrokeDocument | null;
  /** Called (debounced) with the strokes after each change, and once more when the canvas goes away. */
  onChange?: (strokes: readonly Stroke[]) => void;
  debounceMs?: number;
  /** Names the writing area for assistive technology, e.g. "Working space for question 3". */
  label: string;
  className?: string;
  ref?: Ref<HandwritingCanvasHandle>;
};

const ERASER_RADIUS_PX = 16;
const PNG_WIDTH = 1600;

const DOT_GRID = {
  backgroundImage: "radial-gradient(circle, rgba(82, 96, 109, 0.28) 1.2px, transparent 1.4px)",
  backgroundSize: "28px 28px",
} as const;

type ActiveStroke = { pointerId: number; kind: PointerKind; stroke: Stroke; points: StrokePoint[]; startedAt: number };

function newStrokeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function HandwritingCanvas({ initialStrokes, onChange, debounceMs = 300, label, className, ref }: HandwritingCanvasProps): ReactElement {
  const [state, dispatch] = useReducer(strokeReducer, initialStrokes, (saved) => createStrokeState(saved ? (deserialiseStrokes(saved) ?? []) : []));
  const [tool, setTool] = useState<StrokeTool>("pen");
  const [confirmingClear, setConfirmingClear] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const strokesRef = useRef<readonly Stroke[]>(state.present);
  const toolRef = useRef<StrokeTool>(tool);
  const activeRef = useRef<ActiveStroke | null>(null);
  const penRef = useRef<PenActivity>({ penDown: false, lastPenEventAt: null });
  const pendingEraseRef = useRef<Set<string>>(new Set());
  const keepButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    strokesRef.current = state.present;
    toolRef.current = tool;
  });

  // -- painting -------------------------------------------------------------

  const context = useCallback((): CanvasRenderingContext2D | null => canvasRef.current?.getContext("2d") ?? null, []);

  const repaint = useCallback(() => {
    const ctx = context();
    if (!ctx) return;
    const { width, height } = sizeRef.current;
    drawAll(ctx, strokesRef.current, width, height, pendingEraseRef.current);
  }, [context]);

  // Match the pixel buffer to the element and the screen density, and repaint after any resize or rotation.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      repaint();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [repaint]);

  useEffect(() => {
    repaint();
  }, [state.present, repaint]);

  // -- reporting changes ----------------------------------------------------

  const onChangeRef = useRef(onChange);
  const pendingRef = useRef<readonly Stroke[] | null>(null);
  const timerRef = useRef<number | null>(null);
  const notifiedRef = useRef<readonly Stroke[]>(state.present);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      onChangeRef.current?.(pending);
    }
  }, []);

  useEffect(() => {
    if (state.present === notifiedRef.current) return;
    notifiedRef.current = state.present;
    pendingRef.current = state.present;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, debounceMs);
  }, [state.present, debounceMs, flush]);

  // Do not lose the last stroke when the child leaves the question, locks the iPad or reloads.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush, { capture: true });
    document.addEventListener("visibilitychange", onHide, { capture: true });
    return () => {
      window.removeEventListener("pagehide", flush, { capture: true });
      document.removeEventListener("visibilitychange", onHide, { capture: true });
      flush();
    };
  }, [flush]);

  useImperativeHandle(
    ref,
    () => ({
      getStrokes: () => strokesRef.current,
      flush,
      toPngBlob: async () => {
        const { width, height } = sizeRef.current;
        if (width <= 0 || height <= 0) return null;
        const scale = PNG_WIDTH / width;
        const out = document.createElement("canvas");
        out.width = PNG_WIDTH;
        out.height = Math.max(1, Math.round(height * scale));
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        ctx.scale(scale, scale);
        drawAll(ctx, strokesRef.current, width, height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
        return new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
      },
    }),
    [flush],
  );

  // -- pointer handling -----------------------------------------------------

  const pointFrom = (event: PointerEvent | ReactPointerEvent, kind: PointerKind, startedAt: number): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return [
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      effectivePressure(kind, event.pressure),
      Math.max(0, Math.round(event.timeStamp - startedAt)),
    ];
  };

  const eraseAt = (event: PointerEvent | ReactPointerEvent, kind: PointerKind) => {
    const point = pointFrom(event, kind, 0);
    if (!point) return;
    const hits = hitTestStrokes(strokesRef.current, point[0], point[1], ERASER_RADIUS_PX, sizeRef.current);
    const pending = pendingEraseRef.current;
    const before = pending.size;
    hits.forEach((id) => pending.add(id));
    if (pending.size !== before) repaint();
  };

  const discardActive = () => {
    activeRef.current = null;
    pendingEraseRef.current = new Set();
    repaint();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const kind = pointerKind(event.pointerType);
    const now = performance.now();
    if (kind === "pen") {
      // A pen down wins over a finger stroke already under way: that finger was a palm.
      if (activeRef.current && activeRef.current.kind !== "pen") discardActive();
      penRef.current = { penDown: true, lastPenEventAt: now };
    }
    if (!shouldAcceptPointer(kind, penRef.current, now)) return;
    if (kind === "mouse" && event.button !== 0) return;
    if (activeRef.current) return;
    if (toolRef.current === "pen" && isFull(strokesRef.current)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not every pointer can be captured; drawing still works while it stays over the canvas.
    }
    event.preventDefault();
    if (toolRef.current === "eraser") {
      activeRef.current = { pointerId: event.pointerId, kind, stroke: { id: "", tool: "eraser", points: [], width: 0 }, points: [], startedAt: event.timeStamp };
      pendingEraseRef.current = new Set();
      eraseAt(event, kind);
      return;
    }
    const first = pointFrom(event, kind, event.timeStamp);
    if (!first) return;
    const stroke: Stroke = { id: newStrokeId(), tool: "pen", width: PEN_WIDTH, points: [first] };
    activeRef.current = { pointerId: event.pointerId, kind, stroke, points: [first], startedAt: event.timeStamp };
    const ctx = context();
    if (ctx) drawStroke(ctx, stroke, sizeRef.current.width, sizeRef.current.height);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const kind = pointerKind(event.pointerType);
    if (kind === "pen") penRef.current = { ...penRef.current, lastPenEventAt: performance.now() };
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const events = samples.length > 0 ? samples : [event.nativeEvent];
    if (toolRef.current === "eraser" || active.stroke.tool === "eraser") {
      events.forEach((sample) => eraseAt(sample, kind));
      return;
    }
    let added = false;
    for (const sample of events) {
      const point = pointFrom(sample, kind, active.startedAt);
      if (point && shouldKeepPoint(active.points[active.points.length - 1], point)) {
        active.points.push(point);
        added = true;
      }
    }
    if (!added) return;
    const live: Stroke = { ...active.stroke, points: active.points };
    active.stroke = live;
    const ctx = context();
    if (ctx) drawStroke(ctx, live, sizeRef.current.width, sizeRef.current.height, active.points.length - 2);
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const kind = pointerKind(event.pointerType);
    if (kind === "pen") penRef.current = { penDown: false, lastPenEventAt: performance.now() };
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activeRef.current = null;
    if (cancelled) {
      pendingEraseRef.current = new Set();
      repaint();
      return;
    }
    if (active.stroke.tool === "eraser") {
      const ids = [...pendingEraseRef.current];
      pendingEraseRef.current = new Set();
      if (ids.length > 0) dispatch({ type: "erase", ids });
      else repaint();
      return;
    }
    dispatch({ type: "add", stroke: { ...active.stroke, points: active.points } });
  };

  // -- controls -------------------------------------------------------------

  useEffect(() => {
    if (confirmingClear) keepButtonRef.current?.focus();
  }, [confirmingClear]);

  const hasWork = state.present.length > 0;
  const full = isFull(state.present);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    dispatch({ type: event.shiftKey ? "redo" : "undo" });
  };

  return (
    <div data-handwriting className={`flex min-h-0 flex-col gap-2 ${className ?? ""}`.trim()} onKeyDown={onKeyDown}>
      <div className="relative min-h-60 flex-1 overflow-hidden rounded-xl border-2 border-line bg-white" style={DOT_GRID}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${label}. Write with Apple Pencil or your finger.`}
          data-testid="working-canvas"
          data-stroke-count={state.present.length}
          className="absolute inset-0 h-full w-full select-none"
          style={{ touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finish(event, false)}
          onPointerCancel={(event) => finish(event, true)}
          onContextMenu={(event) => event.preventDefault()}
        />
        {hasWork ? null : (
          <p aria-hidden="true" className="pointer-events-none absolute left-4 top-3 text-base text-ink-soft">
            Show your working here
          </p>
        )}
      </div>

      {full ? (
        <p role="status" className="text-base text-ink-soft">
          This space is full. Rub out or clear some working to write more.
        </p>
      ) : null}

      {confirmingClear ? (
        <div role="group" aria-label="Clear working" className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-line bg-surface p-2">
          <p className="mr-auto px-2 text-base font-medium text-ink">Clear your working for this question?</p>
          <ToolButton ref={keepButtonRef} label="Keep working" wide onClick={() => setConfirmingClear(false)} />
          <ToolButton
            label="Clear"
            wide
            danger
            icon={<TrashIcon />}
            onClick={() => {
              dispatch({ type: "clear" });
              setConfirmingClear(false);
            }}
          />
        </div>
      ) : (
        <div role="toolbar" aria-label="Working tools" className="flex flex-wrap items-center gap-2">
          <ToolButton label="Pen" icon={<PenIcon />} pressed={tool === "pen"} onClick={() => setTool("pen")} />
          <ToolButton label="Eraser" icon={<EraserIcon />} pressed={tool === "eraser"} onClick={() => setTool("eraser")} />
          <span aria-hidden="true" className="mx-1 h-8 w-px bg-line" />
          <ToolButton label="Undo" icon={<UndoIcon />} disabled={!canUndo(state)} onClick={() => dispatch({ type: "undo" })} />
          <ToolButton label="Redo" icon={<RedoIcon />} disabled={!canRedo(state)} onClick={() => dispatch({ type: "redo" })} />
          <span className="ml-auto" />
          <ToolButton label="Clear" icon={<TrashIcon />} disabled={!hasWork} onClick={() => setConfirmingClear(true)} />
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  icon,
  pressed,
  danger,
  wide,
  disabled,
  onClick,
  ref,
}: {
  label: string;
  icon?: ReactNode;
  pressed?: boolean;
  danger?: boolean;
  wide?: boolean;
  disabled?: boolean;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}): ReactElement {
  const isToggle = pressed !== undefined;
  const tone = danger
    ? "border-danger text-danger hover:bg-danger hover:text-white"
    : pressed
      ? "border-kaki bg-kaki text-white underline decoration-2 underline-offset-4"
      : "border-line bg-surface text-ink hover:border-kaki";
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={isToggle ? pressed : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-ink-soft disabled:opacity-60 ${wide ? "min-w-28 flex-row gap-2 text-base" : "min-w-14"} ${tone}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const iconProps = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function PenIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}
function EraserIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 20h11" />
      <path d="M5 15l8.5-8.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8l-3-3a1.4 1.4 0 0 1 0-1z" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 4v6h6" />
      <path d="M3.5 14a9 9 0 1 0 2.1-9.4L3 10" />
    </svg>
  );
}
function RedoIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 4v6h-6" />
      <path d="M20.5 14a9 9 0 1 1-2.1-9.4L21 10" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </svg>
  );
}
