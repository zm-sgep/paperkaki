"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { askForRewardAction } from "./actions";

/**
 * "Ask for this" then one confirming tap: two taps in all. The first time, a short tip says a grown-up
 * decides; there is no countdown and nothing is taken off until they say yes.
 */
export function AskButton({ rewardId, title, firstAsk }: { rewardId: string; title: string; firstAsk: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" size="lg" shape="pill" className="w-full sm:w-auto" onClick={() => setConfirming(true)}>
        Ask for this
        <span className="sr-only">: {title}</span>
      </Button>
    );
  }
  return (
    <div data-ask-confirm role="group" aria-label={`Ask for ${title}`} className="flex w-full flex-col gap-3 rounded-3xl border border-kaki/20 bg-kaki-soft p-4 sm:p-5">
      <p className="text-xl font-extrabold text-ink">Ask for {title}?</p>
      {firstAsk ? (
        <p data-first-ask-tip className="text-lg text-ink-soft">
          Your parent will check and say yes or no.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-lg font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="primary"
          loading={pending}
          size="lg"
          shape="pill"
          className="w-full sm:w-auto"
          onClick={() =>
            startTransition(async () => {
              const result = await askForRewardAction(rewardId);
              if (!result.ok) setError(result.error);
              else setConfirming(false);
            })
          }
        >
          Yes, ask
        </Button>
        <Button type="button" variant="quiet" size="lg" shape="pill" disabled={pending} onClick={() => setConfirming(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
