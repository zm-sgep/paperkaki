"use client";

import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DialogActions, ModalDialog } from "./ModalDialog";
import { BANNER_TEXT, formatClock, spokenClock, timerPhase } from "./timer";

/**
 * The frame around a full mock. It has no app navigation at all (no tab bar, no sidebar, no links
 * out): only what helps sit the paper. Header: the assessment title, where the pupil is, the
 * countdown and "End". Footer: whatever the caller puts there (previous, next, question list).
 *
 * No points, badges, rewards, hints or correctness appear anywhere in here (UX_PRINCIPLES 9).
 */

const HIDE_TIMER_KEY = "paperkaki.mock.hideTimer";
const hideTimerListeners = new Set<() => void>();

function readHideTimer(): boolean {
  try {
    return window.localStorage.getItem(HIDE_TIMER_KEY) === "1";
  } catch {
    return false;
  }
}

/** Hiding the timer is a per-device preference, kept in this browser only. */
export function useHideTimerPreference(): readonly [boolean, (hidden: boolean) => void] {
  const hidden = useSyncExternalStore(
    (listener) => {
      hideTimerListeners.add(listener);
      window.addEventListener("storage", listener);
      return () => {
        hideTimerListeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    readHideTimer,
    () => false,
  );
  const set = (next: boolean) => {
    try {
      if (next) window.localStorage.setItem(HIDE_TIMER_KEY, "1");
      else window.localStorage.removeItem(HIDE_TIMER_KEY);
    } catch {
      // The preference just will not stick on this device.
    }
    hideTimerListeners.forEach((listener) => listener());
  };
  return [hidden, set] as const;
}

export type MockModeLayoutProps = {
  /** "Mathematics WA2 · Mock 1" */
  title: string;
  /** "Question 3 of 22", or "Check your paper" on the review screen. */
  progressLabel: string;
  /** 0 to 1, for the thin bar under the header. */
  progress: number;
  /** Seconds left, or null for an untimed paper. */
  remainingSeconds: number | null;
  /** Ending for now: the pupil can carry on later. */
  onLeave: () => void;
  /** From the End dialog: go to the check-and-submit screen. */
  onReview: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** A calm line under the header, e.g. that saving is paused. Not a countdown, not a score. */
  notice?: string | undefined;
};

export function MockModeLayout({ title, progressLabel, progress, remainingSeconds, onLeave, onReview, children, footer, notice }: MockModeLayoutProps): ReactElement {
  const [timerHidden, setTimerHidden] = useHideTimerPreference();
  const [dismissedBanner, setDismissedBanner] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const phase = remainingSeconds === null ? null : timerPhase(remainingSeconds);
  // With the timer hidden nothing counts down at the child, but "time is up" is still said, gently.
  const banner = phase && phase.banner !== "none" && (!timerHidden || phase.banner === "time-up") && dismissedBanner !== phase.banner ? phase.banner : null;

  return (
    <div data-mock-mode className="flex h-dvh flex-col bg-paper text-ink">
      <header className="shrink-0 border-b-2 border-line bg-surface">
        <div className="flex items-center gap-3 px-4 pt-2">
          <h1 className="min-w-0 flex-1 text-base font-semibold leading-tight sm:truncate sm:text-xl">{title}</h1>
          <Button variant="secondary" onClick={() => setEnding(true)} className="shrink-0">
            End
          </Button>
        </div>
        <div className="flex items-center gap-3 px-4 pb-2">
          <p data-progress className="whitespace-nowrap text-sm font-medium text-ink sm:text-base">
            {progressLabel}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {remainingSeconds !== null && !timerHidden ? <TimerChip remaining={remainingSeconds} tone={phase?.tone ?? "calm"} /> : null}
            {remainingSeconds !== null ? (
              <button
                type="button"
                aria-pressed={timerHidden}
                onClick={() => setTimerHidden(!timerHidden)}
                className="inline-flex min-h-12 items-center whitespace-nowrap rounded-lg px-2 text-sm font-semibold text-kaki underline sm:px-3 sm:text-base underline-offset-4 hover:bg-kaki-soft"
              >
                {timerHidden ? "Show timer" : "Hide timer"}
              </button>
            ) : null}
          </div>
        </div>
        <div role="progressbar" aria-label="Paper progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1.5 w-full bg-line">
          <div className="h-full bg-kaki" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
        </div>
      </header>

      {banner ? (
        <div role="status" data-timer-banner={banner} className="flex shrink-0 items-center gap-3 border-b-2 border-warning bg-warning-soft px-4 py-1 text-base text-warning-strong">
          <p className="flex-1">{BANNER_TEXT[banner]}</p>
          <button
            type="button"
            onClick={() => setDismissedBanner(banner)}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg px-3 font-semibold underline underline-offset-4 hover:bg-warning/15"
          >
            OK
          </button>
        </div>
      ) : null}

      {notice ? (
        <p role="status" data-save-notice className="shrink-0 border-b-2 border-line bg-surface px-4 py-1 text-base text-ink-soft">
          {notice}
        </p>
      ) : null}

      <main id="mock-main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>

      {footer ? <footer className="shrink-0 border-t-2 border-line bg-surface px-4 py-2">{footer}</footer> : null}

      <ModalDialog open={ending} onClose={() => setEnding(false)} title="End your mock for now?">
        <p className="text-lg">Your answers are saved. You can carry on later, or check your paper and hand it in now.</p>
        <DialogActions>
          <Button onClick={() => setEnding(false)}>Keep working</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setEnding(false);
              onReview();
            }}
          >
            Check and submit
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setEnding(false);
              onLeave();
            }}
          >
            Stop for now
          </Button>
        </DialogActions>
      </ModalDialog>
    </div>
  );
}

function TimerChip({ remaining, tone }: { remaining: number; tone: "calm" | "amber" }): ReactElement {
  const styles = tone === "amber" ? "border-warning bg-warning-soft text-warning-strong" : "border-kaki/30 bg-kaki-soft text-kaki-strong";
  return (
    <div
      role="timer"
      data-timer
      data-tone={tone}
      aria-label={`Time left: ${spokenClock(remaining)}`}
      className={`inline-flex items-center gap-2 rounded-full border-2 px-2.5 py-1 text-base font-semibold tabular-nums sm:px-3 sm:text-lg ${styles}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M9 2.5h6" />
      </svg>
      <span aria-hidden="true">{formatClock(remaining)}</span>
    </div>
  );
}
