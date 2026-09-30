"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveRequestAction, fulfilRequestAction, rejectRequestAction } from "./actions";

/**
 * Answering a request: "Approve" asks once more, in words that say what happens ("takes 20 points"), then
 * does it; "Not now" is a single tap and moves nothing.
 */
export function RequestActions({
  redemptionId,
  childNickname,
  title,
  cost,
  canApprove,
}: {
  redemptionId: string;
  childNickname: string;
  title: string;
  cost: number;
  canApprove: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (work: () => ReturnType<typeof approveRequestAction>) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error);
      else setConfirming(false);
    });

  if (confirming) {
    return (
      <div data-approve-confirm role="group" aria-label={`Approve ${title}`} className="flex w-full flex-col gap-3 rounded-card border border-kaki/20 bg-kaki-soft p-4">
        <p className="text-lg font-semibold text-ink">
          Approve {title} for {childNickname}? This takes {cost} {cost === 1 ? "point" : "points"}.
        </p>
        {error ? (
          <p role="alert" className="text-base font-medium text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="primary" loading={pending} onClick={() => run(() => approveRequestAction(redemptionId))}>
            Yes, approve
          </Button>
          <Button type="button" variant="quiet" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-base font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="primary" disabled={!canApprove || pending} onClick={() => setConfirming(true)}>
          Approve
          <span className="sr-only">: {title} for {childNickname}</span>
        </Button>
        <Button type="button" variant="secondary" loading={pending} onClick={() => run(() => rejectRequestAction(redemptionId))}>
          Not now
          <span className="sr-only">: {title} for {childNickname}</span>
        </Button>
      </div>
    </div>
  );
}

/** "Mark as given" once the parent has handed over the real reward. */
export function FulfilButton({ redemptionId, title }: { redemptionId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" variant="secondary" loading={pending} onClick={() => startTransition(async () => void (await fulfilRequestAction(redemptionId)))}>
      Mark as given
      <span className="sr-only">: {title}</span>
    </Button>
  );
}
