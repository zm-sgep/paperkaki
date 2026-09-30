import type { ReactElement, ReactNode } from "react";
import { SUBMITTED_HEADING, SUBMITTED_TEXT } from "@/domain/attempts";

/**
 * The end of a mock: handed in, thank you, one way onward. No score, no points and no rewards:
 * results come later, after the paper has been marked, and never inside Mock Mode.
 */
export function SubmittedScreen({ children }: { children?: ReactNode }): ReactElement {
  return (
    <div data-mock-mode data-mock-submitted className="flex h-dvh flex-col items-center justify-center gap-4 bg-paper p-6 text-center text-ink">
      <h1 className="text-3xl font-semibold">{SUBMITTED_HEADING}</h1>
      <p className="max-w-md text-lg text-ink-soft">{SUBMITTED_TEXT}</p>
      {children}
    </div>
  );
}
