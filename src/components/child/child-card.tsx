import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";

/** A rounded, warm card for the child screens. */
export function ChildCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border-2 border-child-line bg-child-card p-6 shadow-sm sm:p-8 ${className ?? ""}`.trim()}>
      {children}
    </section>
  );
}

/**
 * The one dominant card on a child screen: an optional small label, the mission as the page's h1, a
 * short line, and exactly one primary button.
 */
export function ChildHero({
  overline,
  title,
  supportingText,
  ctaLabel,
  href,
}: {
  overline?: string;
  title: ReactNode;
  supportingText?: ReactNode;
  ctaLabel: string;
  href: string;
}) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-3xl border-2 border-kaki/30 bg-kaki-soft p-6 sm:p-8">
      {overline ? <p className="text-base font-semibold uppercase tracking-wide text-kaki-strong">{overline}</p> : null}
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {supportingText ? <p className="text-xl text-ink-soft">{supportingText}</p> : null}
      <ButtonLink href={href} variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
        {ctaLabel}
      </ButtonLink>
    </section>
  );
}

/** An honest, friendly empty state: what will be here, when, and one way back. */
export function ChildEmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
      <ChildCard className="flex flex-col items-start gap-4">
        <p className="text-xl text-ink-soft">{children}</p>
        <ButtonLink href="/today" variant="secondary" className="min-h-14 rounded-2xl px-8 text-lg">
          Back to Today
        </ButtonLink>
      </ChildCard>
    </div>
  );
}
