"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { MockAttempt } from "@/components/mock/MockAttempt";
import type { MockPaper } from "@/components/mock/types";

/** Development preview only: wires the mock screen to a fixture and shows what "Stop for now" and "hand in" would lead to. */
export function MockPreview({ paper }: { paper: MockPaper }): ReactElement {
  const [paused, setPaused] = useState(false);
  const [round, setRound] = useState(0);

  if (paused) {
    return (
      <div data-mock-mode className="flex h-dvh flex-col items-center justify-center gap-4 bg-paper p-6 text-center">
        <h1 className="text-3xl font-semibold">Your mock is saved</h1>
        <p className="max-w-md text-lg text-ink-soft">You can pick it up again whenever you are ready.</p>
        <Button onClick={() => setPaused(false)}>Continue mock</Button>
      </div>
    );
  }

  return (
    <MockAttempt
      key={round}
      paper={paper}
      onLeave={() => setPaused(true)}
      submittedAction={
        <Button variant="secondary" onClick={() => setRound((n) => n + 1)}>
          Start the preview again
        </Button>
      }
    />
  );
}
