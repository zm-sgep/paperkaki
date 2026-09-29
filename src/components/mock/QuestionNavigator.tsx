"use client";

import type { ReactElement } from "react";
import type { QuestionStatus } from "./attempt-state";

/**
 * The list of question numbers. Each square says in words whether it is done or not done, and
 * says it with a shape too (a ticked disc or an empty ring), so colour is never the only cue. A
 * flagged question also shows a flag and the word "Flagged". The pupil taps a number to go there.
 */

export function QuestionNavigator({
  statuses,
  currentIndex,
  onGoTo,
  onToggleFlag,
}: {
  statuses: readonly QuestionStatus[];
  currentIndex: number;
  onGoTo: (index: number) => void;
  onToggleFlag: (questionId: string) => void;
}): ReactElement {
  const current = statuses[currentIndex];
  return (
    <div data-question-navigator className="flex flex-col gap-4">
      {current ? <FlagButton number={current.number} flagged={current.flagged} onToggle={() => onToggleFlag(current.id)} /> : null}
      <ol className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {statuses.map((status, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li key={status.id}>
              <button
                type="button"
                data-question-cell={status.number}
                data-answered={status.answered}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Question ${status.number}, ${status.answered ? "done" : "not done"}${status.flagged ? ", flagged for review" : ""}${isCurrent ? ", you are here" : ""}`}
                onClick={() => onGoTo(index)}
                className={`relative flex min-h-20 w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-2 text-ink transition-colors hover:border-kaki ${
                  isCurrent ? "border-kaki bg-kaki-soft outline-3 outline-offset-2 outline-kaki" : status.answered ? "border-kaki/50 bg-surface" : "border-dashed border-ink-soft bg-surface"
                }`}
              >
                <span aria-hidden="true" className="text-2xl font-semibold leading-none">
                  {status.number}
                </span>
                <span aria-hidden="true" className="flex items-center gap-1 text-sm font-medium">
                  <StatusShape answered={status.answered} />
                  {status.answered ? "Done" : "Not done"}
                </span>
                {status.flagged ? (
                  <span aria-hidden="true" className="flex items-center gap-1 text-sm font-semibold text-ink">
                    <FlagIcon filled />
                    Flagged
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Marks a question to come back to. Shown in the navigator and under each question. */
export function FlagButton({ number, flagged, onToggle, compact = false }: { number: number; flagged: boolean; onToggle: () => void; compact?: boolean }): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={flagged}
      data-flag-toggle
      onClick={onToggle}
      className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 px-3 text-base font-semibold transition-colors ${
        flagged ? "border-kaki bg-kaki-soft text-kaki-strong" : "border-line bg-surface text-ink hover:border-kaki"
      } ${compact ? "flex-col text-sm min-w-16 gap-0.5" : ""}`}
    >
      <FlagIcon filled={flagged} />
      <span>{compact ? (flagged ? "Flagged" : "Flag") : flagged ? `Question ${number} is flagged. Tap to remove.` : `Flag question ${number} to check later`}</span>
    </button>
  );
}

function StatusShape({ answered }: { answered: boolean }): ReactElement {
  return answered ? (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.5" />
    </svg>
  );
}

export function FlagIcon({ filled }: { filled: boolean }): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 4 2 4H5" />
    </svg>
  );
}
