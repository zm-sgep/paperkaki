import type { Metadata } from "next";
import Link from "next/link";
import { getPracticeHome, type PracticeCard as CardData } from "@/application/queries/practice";
import { requireChild } from "@/application/queries/current-child";
import { ChildCard, ChildEmptyState, ChildHero } from "@/components/child/child-card";
import { Stars } from "@/components/child/stars";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { startChosenAction, startRecommendedAction } from "./actions";

export const metadata: Metadata = { title: "Practice · PaperKaki" };
export const dynamic = "force-dynamic";

function TopicRow({ card }: { card: CardData }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-child-line py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xl font-semibold text-ink">{card.label}</span>
        <span className="flex items-center gap-2 text-base text-ink-soft">
          <Stars count={card.stars} />
          <span>{card.word}</span>
        </span>
      </div>
      <form action={startChosenAction}>
        <input type="hidden" name="topicId" value={card.topicId} />
        <SubmitButton variant="secondary" aria-label={`Practise ${card.label}`} className="min-h-14 rounded-2xl px-6 text-lg">
          Practise
        </SubmitButton>
      </form>
    </li>
  );
}

/**
 * Practice, in the order UX_SPEC section 8 gives: one recommended card, the mistakes to fix, the topics
 * to work on, and everything else tucked away. Only the recommended card is a primary button.
 */
export default async function ChildPracticePage({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const child = await requireChild();
  const { outcome } = await searchParams;
  const home = await getPracticeHome(child, { outcome });
  const { primary } = home;

  // Before a first mock there is nothing to base a recommendation on: say so, and keep the topics to browse.
  if (!home.started && !primary) {
    return (
      <>
        <ChildEmptyState title="Practice">Practice will appear here after your first mock.</ChildEmptyState>
        {home.browse.length > 0 ? (
          <details className="rounded-3xl border-2 border-child-line bg-child-card p-6" data-browse>
            <summary className="flex min-h-12 cursor-pointer items-center text-2xl font-semibold text-ink">Browse topics</summary>
            <ul className="flex flex-col pt-2">
              {home.browse.map((card) => (
                <TopicRow key={card.topicId} card={card} />
              ))}
            </ul>
          </details>
        ) : null}
      </>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Practice</h1>

      {primary?.kind === "resume" ? (
        <ChildHero as="h2" overline="Keep going" title={primary.title} supportingText={primary.text} ctaLabel="Continue" href={`/practice/session/${primary.sessionId}`} />
      ) : primary ? (
        <section aria-labelledby="recommended-heading" className="flex flex-col items-start gap-4 rounded-3xl border-2 border-kaki/30 bg-kaki-soft p-6 sm:p-8">
          <p className="text-base font-semibold uppercase tracking-wide text-kaki-strong">{home.requested ? "Just for you" : "Recommended for you"}</p>
          <h2 id="recommended-heading" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {primary.title}
          </h2>
          <p className="text-xl text-ink-soft">{primary.text}</p>
          {primary.outcomeId ? (
            <form action={startChosenAction} className="w-full sm:w-auto">
              <input type="hidden" name="outcomeId" value={primary.outcomeId} />
              <SubmitButton variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
                Start
              </SubmitButton>
            </form>
          ) : (
            <form action={startRecommendedAction} className="w-full sm:w-auto">
              <SubmitButton variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
                Start
              </SubmitButton>
            </form>
          )}
        </section>
      ) : (
        <ChildCard className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-ink">Nothing to practise right now</h2>
          <p className="text-xl text-ink-soft">Nice work. Come back after your next mock, or pick a topic below.</p>
        </ChildCard>
      )}

      {home.mistakes.length > 0 ? (
        <ChildCard className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-ink">Mistakes to fix</h2>
          <ul className="flex flex-col">
            {home.mistakes.map((mistake) => (
              <li key={mistake.attemptId} className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-child-line py-3 last:border-b-0">
                <span className="text-xl text-ink">
                  {mistake.label}
                  <span className="block text-base text-ink-soft">{mistake.count === 1 ? "1 mistake" : `${mistake.count} mistakes`}</span>
                </span>
                <ButtonLink href={mistake.href} variant="secondary" className="min-h-14 rounded-2xl px-6 text-lg">
                  Review mistakes
                </ButtonLink>
              </li>
            ))}
          </ul>
        </ChildCard>
      ) : null}

      {home.toWorkOn.length > 0 ? (
        <ChildCard className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-ink">Topics to work on</h2>
          <ul data-topics-to-work-on className="flex flex-col">
            {home.toWorkOn.map((card) => (
              <TopicRow key={card.topicId} card={card} />
            ))}
          </ul>
        </ChildCard>
      ) : null}

      {home.browse.length > 0 ? (
        <details className="rounded-3xl border-2 border-child-line bg-child-card p-6" data-browse>
          <summary className="flex min-h-12 cursor-pointer items-center text-2xl font-semibold text-ink">Browse other topics</summary>
          <ul className="flex flex-col pt-2">
            {home.browse.map((card) => (
              <TopicRow key={card.topicId} card={card} />
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-base text-ink-soft">
        <Link href="/progress" className="inline-flex min-h-12 items-center underline underline-offset-4">
          See how you are doing
        </Link>
      </p>
    </>
  );
}
