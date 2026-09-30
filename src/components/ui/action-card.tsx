import type { ReactNode } from "react";

/**
 * The one dominant card on a detail page whose own heading is something else (results lead with the score, Progress with
 * a sentence): the same teal-tinted card as the Home hero, without its h1. Put the title, a short reason and exactly one
 * primary action inside as children. The optional picture is decorative.
 */
export function ActionCard({ children, illustration }: { children: ReactNode; illustration?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-hero border border-kaki/15 bg-linear-to-br from-kaki-soft from-55% to-white p-6 shadow-hero sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row-reverse md:items-center md:justify-between md:gap-8">
        {illustration ? (
          <div aria-hidden="true" className="flex shrink-0 justify-center md:pr-2">
            {illustration}
          </div>
        ) : null}
        <div className="flex min-w-0 max-w-xl flex-col items-start gap-3">{children}</div>
      </div>
    </section>
  );
}
