import type { ReactNode } from "react";

/** The page's one h1, with an optional one-sentence description and, above it, a small eyebrow line. */
export function PageHeader({ title, description, eyebrow }: { title: string; description?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5">
      {eyebrow ? <div className="text-base font-medium text-ink-soft">{eyebrow}</div> : null}
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink sm:text-[2rem]">{title}</h1>
      {description ? <p className="text-lg text-ink-soft">{description}</p> : null}
    </header>
  );
}
