import type { ReactNode } from "react";

/**
 * Calm full-page message used by error and not-found screens: what happened, what is
 * still safe, exactly one action, and a small reference for support. No stack traces.
 */
export function StatusScreen({
  title,
  children,
  action,
  reference,
}: {
  title: string;
  children: ReactNode;
  action: ReactNode;
  reference?: string | undefined;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <div className="flex flex-col gap-2 text-lg text-ink-soft">{children}</div>
      <div className="pt-2">{action}</div>
      {reference ? (
        <p className="pt-4 text-sm text-ink-soft">
          Reference: <span className="font-mono">{reference}</span>
        </p>
      ) : null}
    </main>
  );
}

/** Class names for the single primary action on a status screen (44px+ touch target). */
export const primaryActionClassName =
  "inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg bg-kaki px-6 py-3 text-lg font-semibold text-white hover:bg-kaki-strong";
