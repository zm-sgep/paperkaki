"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import type { QuestionStatus } from "./attempt-state";
import { DialogActions, ModalDialog } from "./ModalDialog";
import { FlagIcon } from "./QuestionNavigator";

/**
 * "Check your paper": what is not answered yet and what was flagged, each a button that jumps
 * back to that question, then Submit with a second, plain-worded confirmation. It says nothing
 * about right or wrong, and offers no points or hints.
 */

export function SubmitReview({
  statuses,
  onJump,
  onBack,
  onSubmit,
  submitting = false,
  error,
}: {
  statuses: readonly QuestionStatus[];
  onJump: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  /** Plain words when handing in failed. The pupil's answers are still safe. */
  error?: string | undefined;
}): ReactElement {
  const [confirming, setConfirming] = useState(false);
  const unanswered = statuses.filter((s) => !s.answered);
  const flagged = statuses.filter((s) => s.flagged);
  const answeredCount = statuses.length - unanswered.length;

  return (
    <section data-submit-review aria-labelledby="review-heading" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="review-heading" className="text-3xl font-semibold">
          Check your paper
        </h2>
        <p className="text-lg text-ink-soft">
          You have answered {answeredCount} of {statuses.length} questions.
        </p>
      </div>

      {unanswered.length > 0 ? (
        <QuestionGroup title={`Not answered yet (${unanswered.length})`} statuses={unanswered} onJump={onJump} testId="unanswered" />
      ) : null}
      {flagged.length > 0 ? (
        <QuestionGroup title={`Flagged to check (${flagged.length})`} statuses={flagged} onJump={onJump} testId="flagged" flagIcon />
      ) : null}
      {unanswered.length === 0 && flagged.length === 0 ? <p className="text-lg">Every question has an answer, and nothing is flagged.</p> : null}

      {error ? (
        <p role="alert" className="text-lg font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
        <Button onClick={() => setConfirming(true)} loading={submitting}>
          Submit paper
        </Button>
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          Back to questions
        </Button>
      </div>

      <ModalDialog open={confirming} onClose={() => setConfirming(false)} title="Submit your paper?">
        <p className="text-lg">You can&apos;t change answers after this.</p>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirming(false);
              onSubmit();
            }}
          >
            Yes, submit
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Keep checking
          </Button>
        </DialogActions>
      </ModalDialog>
    </section>
  );
}

function QuestionGroup({
  title,
  statuses,
  onJump,
  testId,
  flagIcon = false,
}: {
  title: string;
  statuses: readonly QuestionStatus[];
  onJump: (index: number) => void;
  testId: string;
  flagIcon?: boolean;
}): ReactElement {
  return (
    <div data-review-group={testId} className="flex flex-col gap-3">
      <h3 className="text-xl font-semibold">{title}</h3>
      <ul className="flex flex-wrap gap-3">
        {statuses.map((status) => (
          <li key={status.id}>
            <button
              type="button"
              onClick={() => onJump(status.number - 1)}
              className="inline-flex min-h-14 min-w-28 items-center justify-center gap-2 rounded-xl border-2 border-line bg-surface px-4 text-lg font-semibold text-ink hover:border-kaki"
            >
              {flagIcon ? <FlagIcon filled /> : null}
              Question {status.number}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
