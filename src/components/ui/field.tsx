import type { ReactNode } from "react";

/** The class every text-like input uses: 48px tall, visible border, larger text. */
export const inputClassName =
  "min-h-12 w-full rounded-lg border-2 border-line bg-surface px-4 text-lg text-ink focus-visible:border-kaki aria-[invalid=true]:border-danger";

/** A label above its control, with an optional hint and an inline error in plain words. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-lg font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-base text-ink-soft">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-base font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
