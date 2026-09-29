"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Error inside the shell: the navigation stays, so the parent can go elsewhere or try again. */
export default function ParentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold text-ink">Something went wrong on our side</h1>
      <p className="text-lg text-ink-soft">This page could not load. Anything you had already saved is safe.</p>
      <Button onClick={() => retry()}>Try again</Button>
      {error.digest ? (
        <p className="text-sm text-ink-soft">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </Card>
  );
}
