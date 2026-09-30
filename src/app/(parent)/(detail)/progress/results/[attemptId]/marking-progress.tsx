"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { MarkingStep } from "@/domain/attempts";

const POLL_MS = 2000;

function Mark({ state }: { state: MarkingStep["state"] }) {
  if (state === "done") {
    return (
      <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-kaki text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin text-kaki" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-warning text-lg font-bold text-white">
        !
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center">
      <span className="h-3 w-3 rounded-full border-2 border-line" />
    </span>
  );
}

/**
 * "Uploading paper ✓ / Reading answers / Marking questions / Preparing results": where marking really is,
 * with no countdown. Asks every two seconds and refreshes the page when marking has moved on.
 */
export function MarkingProgress({ attemptId, steps, live }: { attemptId: string; steps: MarkingStep[]; live: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    async function check(): Promise<void> {
      try {
        const response = await fetch(`/api/attempts/${attemptId}/marking`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { state?: string; steps?: MarkingStep[] };
        const current = steps.map((step) => `${step.id}:${step.state}`).join();
        const now = (body.steps ?? []).map((step) => `${step.id}:${step.state}`).join();
        if (!stopped && (body.state !== "marking" || now !== current)) router.refresh();
      } catch {
        // A dropped request is fine: the next check tries again.
      }
    }
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [attemptId, live, router, steps]);

  return (
    <ol role="status" aria-live="polite" data-marking-steps className="flex flex-col gap-3 text-lg text-ink">
      {steps.map((step) => (
        <li key={step.id} data-step={step.id} data-state={step.state} className={`flex items-center gap-3 ${step.state === "waiting" ? "text-ink-soft" : ""}`}>
          <Mark state={step.state} />
          <span className={step.state === "active" || step.state === "failed" ? "font-semibold" : ""}>
            {step.label}
            {step.state === "done" ? <span className="sr-only"> (done)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
