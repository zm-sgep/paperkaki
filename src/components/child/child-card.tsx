import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

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
  action,
  as: Heading = "h1",
  children,
}: {
  overline?: string;
  title: ReactNode;
  supportingText?: ReactNode;
  ctaLabel: string;
  /** Where the button goes. Ignored when `action` is given. */
  href: string;
  /** A server action the button runs instead of following a link (for a one-tap start). */
  action?: () => Promise<void>;
  /** The card is the page's heading by default; a page with its own heading uses "h2". */
  as?: "h1" | "h2";
  /** Quiet extra content between the text and the button, for example what was just earned. */
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-3xl border-2 border-kaki/30 bg-kaki-soft p-6 sm:p-8">
      {overline ? <p className="text-base font-semibold uppercase tracking-wide text-kaki-strong">{overline}</p> : null}
      <Heading className={`${Heading === "h1" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"} font-semibold tracking-tight text-ink`}>{title}</Heading>
      {supportingText ? <p className="text-xl text-ink-soft">{supportingText}</p> : null}
      {children}
      {action ? (
        <form action={action} className="w-full sm:w-auto">
          <SubmitButton variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
            {ctaLabel}
          </SubmitButton>
        </form>
      ) : (
        <ButtonLink href={href} variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
          {ctaLabel}
        </ButtonLink>
      )}
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
