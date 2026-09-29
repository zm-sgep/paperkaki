"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { markVerifiedAction, type VerifyState } from "../../../actions";

/** Asks for the page or section only when no source link has one yet. */
export function VerifyForm({
  versionId,
  outcomeId,
  needsPageReference,
}: {
  versionId: string;
  outcomeId: string;
  needsPageReference: boolean;
}) {
  const [state, formAction] = useActionState<VerifyState, FormData>(markVerifiedAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="outcomeId" value={outcomeId} />
      {needsPageReference ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="pageOrSection" className="text-base font-medium text-ink">
            Page or section in the source
          </label>
          <input
            id="pageOrSection"
            name="pageOrSection"
            type="text"
            required
            aria-describedby="pageOrSection-help"
            className="min-h-12 rounded-lg border-2 border-line bg-surface px-3 text-base text-ink focus-visible:border-kaki"
          />
          <p id="pageOrSection-help" className="text-sm text-ink-soft">
            No source link has a page reference yet. Enter where you checked this outcome, for example &ldquo;p. 35, 1.2&rdquo;.
          </p>
        </div>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-base font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-base font-medium text-kaki-strong">
          Marked verified.
        </p>
      ) : null}
      <SubmitButton variant="primary" className="self-start">
        Mark verified
      </SubmitButton>
    </form>
  );
}
