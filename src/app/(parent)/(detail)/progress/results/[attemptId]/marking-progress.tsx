"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { MarkingStep } from "@/domain/attempts";

const POLL_MS = 2000;

function Mark({ state }: { state: MarkingStep["state"] }) {
  if (state === "done") {
    return (
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-kaki text-white">
        <Check className="h-4 w-4" strokeWidth={3.5} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-kaki-soft text-kaki">
        <LoaderCircle className="h-5 w-5 animate-spin" strokeWidth={2.75} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-coral-soft text-coral-strong">
        <CircleAlert className="h-5 w-5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center">
      <span className="h-3.5 w-3.5 rounded-full border-2 border-line-strong bg-surface" />
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
    <ol
      role="status"
      aria-live="polite"
      data-marking-steps
      className="flex flex-col rounded-card border border-line bg-surface p-2 text-lg text-ink shadow-card sm:p-3"
    >
      {steps.map((step) => (
        <li
          key={step.id}
          data-step={step.id}
          data-state={step.state}
          className={`flex min-h-14 items-center gap-4 rounded-control px-3 py-2 ${step.state === "waiting" ? "text-ink-soft" : ""} ${step.state === "active" ? "bg-kaki-soft" : ""}`}
        >
          <Mark state={step.state} />
          <span className={step.state === "active" || step.state === "failed" ? "font-bold" : step.state === "done" ? "font-medium" : ""}>
            {step.label}
            {step.state === "done" ? <span className="sr-only"> (done)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
