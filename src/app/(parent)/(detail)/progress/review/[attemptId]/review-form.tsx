"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveReviewAction, type ReviewState } from "./actions";

/**
 * The mark choices as large buttons (0 up to the marks), one primary "Save and next". A suggested mark is
 * ticked to begin with and labelled, so a parent who agrees taps once; the choice is always theirs.
 */
export function ReviewForm({
  attemptId,
  paperQuestionId,
  choices,
  marks,
  suggested,
}: {
  attemptId: string;
  paperQuestionId: string;
  choices: number[];
  marks: number;
  suggested: number | null;
}) {
  const [state, formAction] = useActionState<ReviewState, FormData>(saveReviewAction.bind(null, attemptId, paperQuestionId), {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="pb-1 text-lg font-semibold text-ink">How many marks?</legend>
        <div className="flex flex-wrap gap-3">
          {choices.map((choice) => (
            <label key={choice} className="group relative block cursor-pointer">
              <input type="radio" name="score" value={choice} defaultChecked={suggested === choice} className="peer sr-only" />
              <span className="flex min-h-14 min-w-14 flex-col items-center justify-center rounded-xl border-2 border-line bg-surface px-4 py-2 text-xl font-semibold text-ink transition-colors group-hover:border-kaki/60 group-has-checked:border-kaki group-has-checked:bg-kaki-soft group-has-focus-visible:outline-3 group-has-focus-visible:outline-offset-3 group-has-focus-visible:outline-kaki">
                <span>{choice}</span>
                {suggested === choice ? <span className="text-sm font-normal text-ink-soft">Suggested</span> : null}
              </span>
            </label>
          ))}
        </div>
        <p className="text-base text-ink-soft">Out of {marks}.</p>
      </fieldset>
      {state.error ? (
        <p role="alert" className="text-base font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full sm:w-auto sm:self-start">Save and next</SubmitButton>
    </form>
  );
}
