import type { ReactNode } from "react";

/** The page's one h1, with an optional one-sentence description. */
export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {description ? <p className="text-lg text-ink-soft">{description}</p> : null}
    </header>
  );
}
