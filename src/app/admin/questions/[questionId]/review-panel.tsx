"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { QuestionStatus } from "@/domain/questions/lifecycle";
import { CHECKLIST_LABELS } from "@/domain/questions/lifecycle";
import { reviewAction, submitForReviewAction, type QuestionActionState } from "../actions";

function Feedback({ state }: { state: QuestionActionState }) {
  return (
    <>
      {state.error ? (
        <div role="alert" className="flex flex-col gap-1 rounded-lg border-2 border-danger bg-surface p-3">
          <p className="text-base font-semibold text-danger">{state.error}</p>
          {state.issues && state.issues.length > 0 ? (
            <ul className="list-disc pl-5 text-base text-danger">
              {state.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.done ? (
        <p role="status" className="text-base font-semibold text-kaki-strong">
          {state.done}
        </p>
      ) : null}
    </>
  );
}

/** A draft has one job: send it for review. */
export function SubmitForReviewForm({ questionId }: { questionId: string }) {
  const [state, action] = useActionState<QuestionActionState, FormData>(submitForReviewAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="questionId" value={questionId} />
      <Feedback state={state} />
      <SubmitButton variant="primary" className="self-start">
        Send for review
      </SubmitButton>
    </form>
  );
}

const CHECKLIST_KEYS = ["curriculum", "answer", "clarity", "ageAppropriate"] as const;

/**
 * The reviewer's checklist and decision. Approve is the dominant action; the server refuses it
 * unless every box is ticked and the automatic answer check passes.
 */
export function ReviewForm({
  questionId,
  status,
  answerNeedsPerson,
}: {
  questionId: string;
  status: QuestionStatus;
  answerNeedsPerson: boolean;
}) {
  const [state, action] = useActionState<QuestionActionState, FormData>(reviewAction, {});
  const canDecide = status === "in_review";
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="questionId" value={questionId} />
      {canDecide ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-lg font-semibold text-ink">Before you approve, check that</legend>
          {CHECKLIST_KEYS.map((key) => (
            <label key={key} className="flex min-h-12 items-center gap-3 text-lg text-ink">
              <input type="checkbox" name={key} className="h-6 w-6 accent-kaki" />
              <span>
                {CHECKLIST_LABELS[key]}
                {key === "answer" && answerNeedsPerson ? (
                  <span className="block text-sm text-ink-soft">This one is your check: no calculation can confirm this answer.</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <label className="flex flex-col gap-1 text-base font-medium text-ink">
        Notes {canDecide ? "(needed to request changes)" : "(needed to retire)"}
        <textarea name="notes" rows={3} className="rounded-lg border-2 border-line bg-surface px-3 py-2 text-base text-ink focus-visible:border-kaki" />
      </label>
      <Feedback state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {canDecide ? (
          <>
            <ApproveButton />
            <ChoiceButton decision="changes_requested" variant="secondary">
              Request changes
            </ChoiceButton>
          </>
        ) : null}
        {status !== "retired" ? (
          <ChoiceButton decision="retire" variant="quiet">
            Retire
          </ChoiceButton>
        ) : null}
      </div>
    </form>
  );
}

function ApproveButton() {
  return (
    <SubmitButton variant="primary" name="decision" value="approved">
      Approve
    </SubmitButton>
  );
}

function ChoiceButton({ decision, variant, children }: { decision: string; variant: "secondary" | "quiet"; children: string }) {
  return (
    <Button type="submit" name="decision" value={decision} variant={variant}>
      {children}
    </Button>
  );
}
