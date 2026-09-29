import type { ReactNode } from "react";
import { ButtonLink } from "./button";

/**
 * The single dominant card on a decision screen (its title is the page heading): what to do now, a short reason, and exactly
 * one primary action. Nothing else on the card competes with it.
 */
export function HeroAction({
  title,
  supportingText,
  ctaLabel,
  href,
}: {
  title: ReactNode;
  supportingText?: ReactNode;
  ctaLabel: string;
  href: string;
}) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-2xl border border-kaki/30 bg-kaki-soft p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {supportingText ? <p className="text-lg text-ink-soft">{supportingText}</p> : null}
      <ButtonLink href={href} variant="primary" className="w-full sm:w-auto">
        {ctaLabel}
      </ButtonLink>
    </section>
  );
}
