"use client";

import { useActionState } from "react";
import { inputClassName } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { signInAction, type SignInState } from "./actions";

export function SignInForm() {
  const [state, formAction] = useActionState<SignInState, FormData>(signInAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-lg font-semibold text-ink">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : undefined}
          className={inputClassName}
        />
        {state.error ? (
          <p id="email-error" role="alert" className="text-base font-medium text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
      <SubmitButton variant="primary" size="lg" className="w-full">
        Continue
      </SubmitButton>
      <p className="text-sm text-ink-soft">Development sign-in. No password needed.</p>
    </form>
  );
}
