import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Sprout } from "@/components/illustrations";
import { ButtonLink, buttonClassName } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * The child screens' building blocks: rounder shapes (24px cards, 28px hero cards, pill buttons), a warm
 * card colour on a cream page, Nunito at 18px (set once on the shell), and kaya yellow for the small
 * moments of delight. Parent screens use src/components/ui instead; the two share tokens, not layouts.
 */

/** A small white pill for one quiet fact ("Next: WA2 · Tue 14 Oct"), used with an icon in front. */
export const childPillClassName =
  "inline-flex w-fit max-w-full items-center gap-2.5 rounded-[1.75rem] border border-child-line bg-child-card px-5 py-2.5 text-lg font-semibold leading-snug text-ink shadow-child";

/** A rounded, warm card for the child screens. */
export function ChildCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-child-line bg-child-card p-5 shadow-child sm:p-7 ${className ?? ""}`.trim()}>
      {children}
    </section>
  );
}

/** The page's one h1: big, round and friendly. */
export function ChildTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{children}</h1>;
}

/** A section heading (h2) inside a child page. */
export function ChildSectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-2xl font-extrabold tracking-tight text-ink">
      {children}
    </h2>
  );
}

/** The quiet way back: an arrow and the words, pulled to the page edge. */
export function ChildBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClassName("quiet", "md", { shape: "pill", flush: true })}>
      <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
      {children}
    </Link>
  );
}

/**
 * The one dominant card on a child screen: a small "mission" chip, the title as the page's h1, optional
 * chips and a short line, an optional picture, and exactly one big pill button.
 */
export function ChildHero({
  overline,
  title,
  supportingText,
  chips,
  illustration,
  ctaLabel,
  href,
  action,
  cta,
  as: Heading = "h1",
  headingId,
  children,
}: {
  overline?: string;
  title: ReactNode;
  supportingText?: ReactNode;
  /** Chips under the title: how long it takes, for example. */
  chips?: ReactNode;
  /** A decorative picture: above the words on a phone, on the right from tablet width. */
  illustration?: ReactNode;
  ctaLabel?: string;
  /** Where the button goes. Ignored when `action` or `cta` is given. */
  href?: string;
  /** A server action the button runs instead of following a link (for a one-tap start). */
  action?: () => Promise<void>;
  /** A whole button of the page's own (for a form with hidden fields). Use `ChildCta` inside it. */
  cta?: ReactNode;
  /** The card is the page's heading by default; a page with its own heading uses "h2". */
  as?: "h1" | "h2";
  headingId?: string;
  /** Quiet extra content between the text and the button, for example what was just earned. */
  children?: ReactNode;
}) {
  return (
    <section
      {...(headingId ? { "aria-labelledby": headingId } : {})}
      className="relative overflow-hidden rounded-hero border border-kaki/20 bg-linear-to-br from-kaki-soft from-55% to-child-card p-6 shadow-child-hero motion-safe:animate-enter sm:p-8"
    >
      <div className="flex flex-col gap-5 md:flex-row-reverse md:items-center md:justify-between md:gap-8">
        {illustration ? (
          <div aria-hidden="true" className="flex shrink-0 justify-center md:pr-4">
            {illustration}
          </div>
        ) : null}
        <div className="flex min-w-0 max-w-xl flex-col items-start gap-4">
          {overline ? (
            <Chip tone="kaya" size="lg" icon={<Sparkles />}>
              {overline}
            </Chip>
          ) : null}
          <Heading
            {...(headingId ? { id: headingId } : {})}
            className={`${Heading === "h1" ? "text-[2rem] sm:text-4xl" : "text-[1.75rem] sm:text-3xl"} font-extrabold leading-tight tracking-tight text-ink`}
          >
            {title}
          </Heading>
          {chips ? <div className="flex flex-wrap items-center gap-2">{chips}</div> : null}
          {supportingText ? <p className="text-xl text-ink-soft">{supportingText}</p> : null}
          {children}
          {cta ??
            (action ? (
              <form action={action} className="w-full sm:w-auto">
                <ChildCta>{ctaLabel}</ChildCta>
              </form>
            ) : (
              <ButtonLink href={href ?? "/today"} variant="primary" size="xl" shape="pill" className="mt-1 w-full sm:w-auto">
                {ctaLabel}
              </ButtonLink>
            ))}
        </div>
      </div>
    </section>
  );
}

/** The big pill submit button of a child card's form. */
export function ChildCta({ children }: { children: ReactNode }) {
  return (
    <SubmitButton variant="primary" size="xl" shape="pill" className="mt-1 w-full sm:w-auto">
      {children}
    </SubmitButton>
  );
}

/** An honest, friendly empty state: a picture, what will be here and when, and one way back. */
export function ChildEmptyState({ title, children, illustration }: { title: string; children: ReactNode; illustration?: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <ChildTitle>{title}</ChildTitle>
      <ChildCard className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
        <div aria-hidden="true" className="flex w-full shrink-0 justify-center sm:w-auto">
          {illustration ?? <Sprout className="h-28 w-auto sm:h-32" />}
        </div>
        <div className="flex min-w-0 flex-col items-start gap-4">
          <p className="text-xl text-ink-soft">{children}</p>
          <ButtonLink href="/today" variant="secondary" size="lg" shape="pill">
            Back to Today
          </ButtonLink>
        </div>
      </ChildCard>
    </div>
  );
}
