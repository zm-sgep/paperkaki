"use client";

import { SubmitButton } from "@/components/ui/submit-button";
import { retryMarkingAction } from "./actions";

export function RetryForm({ attemptId }: { attemptId: string }) {
  return (
    <form action={retryMarkingAction.bind(null, attemptId)}>
      <SubmitButton className="w-full sm:w-auto">Try again</SubmitButton>
    </form>
  );
}
