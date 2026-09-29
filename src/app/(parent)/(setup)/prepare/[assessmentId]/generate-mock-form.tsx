"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { generateMockAction, type MockState } from "./actions";

/** The one primary action. While a problem remains it is disabled and the reason stays visible. */
export function GenerateMockForm({ assessmentId, canGenerate, reason }: { assessmentId: string; canGenerate: boolean; reason: string | null }) {
  const [state, formAction] = useActionState<MockState, FormData>(generateMockAction.bind(null, assessmentId), {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <SubmitButton variant="primary" disabled={!canGenerate} aria-describedby={!canGenerate && reason ? "generate-reason" : undefined} className="w-full sm:w-auto sm:self-start">
        Generate first mock
      </SubmitButton>
      {!canGenerate && reason ? (
        <p id="generate-reason" className="text-base text-ink-soft">
          {reason}
        </p>
      ) : null}
      <p role="status" className="text-base text-ink">
        {state.message}
      </p>
    </form>
  );
}
