import { ChevronDown, Lightbulb, Shapes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getPracticeHome, type PracticeCard as CardData } from "@/application/queries/practice";
import { requireChild } from "@/application/queries/current-child";
import { ChildCard, ChildCta, ChildEmptyState, ChildHero, ChildSectionTitle, ChildTitle } from "@/components/child/child-card";
import { ChildRowButton, ChildRowLink } from "@/components/child/child-row";
import { Stars } from "@/components/child/stars";
import { Sunrise } from "@/components/illustrations";
import { buttonClassName } from "@/components/ui/button";
import { startChosenAction, startRecommendedAction } from "./actions";

export const metadata: Metadata = { title: "Practice · PaperKaki" };
export const dynamic = "force-dynamic";

/** One topic as a tappable card: its stars and word, and one tap starts the practice. */
function TopicRow({ card }: { card: CardData }) {
  return (
    <li>
      <form action={startChosenAction}>
        <input type="hidden" name="topicId" value={card.topicId} />
        <ChildRowButton
          label={`Practise ${card.label}`}
          icon={<Shapes />}
          title={card.label}
          detail={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <Stars count={card.stars} />
              <span>{card.word}</span>
            </span>
          }
          action="Practise"
        />
      </form>
    </li>
  );
}

/** A folded-away list of topics: a heading that opens it, with a turning chevron. */
function TopicsDisclosure({ title, cards }: { title: string; cards: CardData[] }) {
  return (
    <details className="group/details rounded-3xl border border-child-line bg-child-card p-5 shadow-child" data-browse>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-2xl font-extrabold text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kaki-soft text-kaki-strong transition-transform group-open/details:rotate-180">
          <ChevronDown className="h-5 w-5" strokeWidth={2.75} />
        </span>
      </summary>
      <ul className="flex flex-col gap-3 pt-4">
        {cards.map((card) => (
          <TopicRow key={card.topicId} card={card} />
        ))}
      </ul>
    </details>
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
        {home.browse.length > 0 ? <TopicsDisclosure title="Browse topics" cards={home.browse} /> : null}
      </>
    );
  }

  return (
    <>
      <ChildTitle>Practice</ChildTitle>

      {primary?.kind === "resume" ? (
        <ChildHero
          as="h2"
          overline="Keep going"
          title={primary.title}
          supportingText={primary.text}
          illustration={<Sunrise className="h-24 w-auto md:h-36" />}
          ctaLabel="Continue"
          href={`/practice/session/${primary.sessionId}`}
        />
      ) : primary ? (
        <ChildHero
          as="h2"
          headingId="recommended-heading"
          overline={home.requested ? "Just for you" : "Recommended for you"}
          title={primary.title}
          supportingText={primary.text}
          illustration={<Sunrise className="h-24 w-auto md:h-36" />}
          cta={
            <form action={primary.outcomeId ? startChosenAction : startRecommendedAction} className="w-full sm:w-auto">
              {primary.outcomeId ? <input type="hidden" name="outcomeId" value={primary.outcomeId} /> : null}
              <ChildCta>Start</ChildCta>
            </form>
          }
        />
      ) : (
        <ChildCard className="flex flex-col gap-2">
          <ChildSectionTitle>Nothing to practise right now</ChildSectionTitle>
          <p className="text-xl text-ink-soft">Nice work. Come back after your next mock, or pick a topic below.</p>
        </ChildCard>
      )}

      {home.mistakes.length > 0 ? (
        <section aria-labelledby="mistakes-heading" className="flex flex-col gap-3">
          <ChildSectionTitle id="mistakes-heading">Mistakes to fix</ChildSectionTitle>
          <ul className="flex flex-col gap-3">
            {home.mistakes.map((mistake) => (
              <li key={mistake.attemptId}>
                <ChildRowLink
                  href={mistake.href}
                  icon={<Lightbulb />}
                  tone="kaya"
                  title={mistake.label}
                  detail={mistake.count === 1 ? "1 mistake" : `${mistake.count} mistakes`}
                  action="Review mistakes"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {home.toWorkOn.length > 0 ? (
        <section aria-labelledby="work-on-heading" className="flex flex-col gap-3">
          <ChildSectionTitle id="work-on-heading">Topics to work on</ChildSectionTitle>
          <ul data-topics-to-work-on className="flex flex-col gap-3">
            {home.toWorkOn.map((card) => (
              <TopicRow key={card.topicId} card={card} />
            ))}
          </ul>
        </section>
      ) : null}

      {home.browse.length > 0 ? <TopicsDisclosure title="Browse other topics" cards={home.browse} /> : null}

      <p>
        <Link href="/progress" className={buttonClassName("quiet", "md", { shape: "pill", flush: true })}>
          See how you are doing
        </Link>
      </p>
    </>
  );
}
