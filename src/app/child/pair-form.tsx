"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { pairDeviceAction, type PairState } from "./actions";

export function PairForm() {
  const [state, formAction] = useActionState<PairState, FormData>(pairDeviceAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field id="pair-code" label="Enter the code from your parent" error={state.error}>
        <input
          id="pair-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "pair-code-error" : undefined}
          className="min-h-16 w-full rounded-2xl border-2 border-line bg-surface px-5 text-center text-4xl font-semibold tracking-[0.3em] tabular-nums text-ink focus-visible:border-kaki aria-[invalid=true]:border-danger"
        />
      </Field>
      <SubmitButton className="min-h-14 w-full text-xl">Go</SubmitButton>
    </form>
  );
}
