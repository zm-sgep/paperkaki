"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { assignToIpadAction, type AssignState } from "./actions";

/**
 * The quiet second way to do a mock: on the iPad. Once it has been given, the button is replaced by
 * where the mock is now, so there is nothing to press twice.
 */
export function IpadOption({
  paperId,
  childNickname,
  status,
}: {
  paperId: string;
  childNickname: string;
  status: { message: string } | null;
}) {
  const [state, formAction] = useActionState<AssignState, FormData>(assignToIpadAction.bind(null, paperId), {});
  if (status) {
    return (
      <p data-ipad-status className="text-lg font-medium text-ink">
        {status.message}
      </p>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <SubmitButton variant="secondary" className="w-full sm:w-auto sm:self-start">
        Do it on iPad instead
      </SubmitButton>
      <p className="text-base text-ink-soft">{childNickname} will find it on their Today screen.</p>
      {state.error ? (
        <p role="alert" className="text-base font-medium text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
