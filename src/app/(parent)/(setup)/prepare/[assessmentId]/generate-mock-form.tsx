"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { generateMockAction, type MockState } from "./actions";

type Props = {
  assessmentId: string;
  /** Made when the screen was drawn. The same key never makes two mocks. */
  requestKey: string;
  canGenerate: boolean;
  reason: string | null;
  label: string;
  variant?: "primary" | "secondary";
};

/**
 * Creates a mock. While it works it says so calmly and the button cannot be pressed again.
 * While a problem remains it is disabled and the reason stays visible.
 */
export function GenerateMockForm({ assessmentId, requestKey, canGenerate, reason, label, variant = "primary" }: Props) {
  const [state, formAction, pending] = useActionState<MockState, FormData>(generateMockAction.bind(null, assessmentId), {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="requestKey" value={requestKey} />
      <SubmitButton
        variant={variant}
        size={variant === "primary" ? "lg" : "md"}
        disabled={!canGenerate}
        aria-describedby={!canGenerate && reason ? "generate-reason" : undefined}
        className="w-full sm:w-auto sm:self-start"
      >
        {pending ? "Creating your mock…" : label}
      </SubmitButton>
      {!canGenerate && reason ? (
        <p id="generate-reason" className="text-base text-ink-soft">
          {reason}
        </p>
      ) : null}
      <div role="status" aria-live="polite" className="text-base text-ink-soft">
        {pending ? "This takes a few seconds. Please keep this page open." : null}
      </div>
      {state.problems && !pending ? (
        <Notice tone="alert" role="alert">
          {state.problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </Notice>
      ) : null}
    </form>
  );
}
