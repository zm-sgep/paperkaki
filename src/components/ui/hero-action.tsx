import type { ReactNode } from "react";
import { ButtonLink } from "./button";

/**
 * The single dominant card on a decision screen (its title is the page heading): what to do now, a short reason, and exactly
 * one primary action. Nothing else on the card competes with it.
 *
 * `eyebrow` is a small line above the title (a row of Chips, or a sentence). `illustration` is a
 * decorative picture: above the words on a phone, on the right from tablet width. It is hidden from
 * screen readers and never carries meaning the words do not.
 */
export function HeroAction({
  title,
  supportingText,
  ctaLabel,
  href,
  eyebrow,
  illustration,
}: {
  title: ReactNode;
  supportingText?: ReactNode;
  ctaLabel: string;
  href: string;
  eyebrow?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-hero border border-kaki/15 bg-linear-to-br from-kaki-soft from-55% to-white p-6 shadow-hero motion-safe:animate-enter sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row-reverse md:items-center md:justify-between md:gap-8">
        {illustration ? (
          <div aria-hidden="true" className="flex shrink-0 justify-start md:justify-center md:pr-2">
            {illustration}
          </div>
        ) : null}
        <div className="flex min-w-0 max-w-xl flex-col items-start gap-4">
          {eyebrow ? <div className="flex flex-wrap items-center gap-2 text-base font-medium text-ink-soft">{eyebrow}</div> : null}
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink sm:text-[2rem]">{title}</h1>
          {supportingText ? <p className="text-lg text-ink-soft">{supportingText}</p> : null}
          <ButtonLink href={href} variant="primary" size="lg" className="mt-1 w-full sm:w-auto">
            {ctaLabel}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
