import { Lightbulb, Medal, Star } from "lucide-react";
import type { Metadata } from "next";
import { requireChild } from "@/application/queries/current-child";
import { getChildProgress } from "@/application/queries/progress";
import { ChildCard, ChildEmptyState, ChildSectionTitle, ChildTitle } from "@/components/child/child-card";
import { ChildRowLink } from "@/components/child/child-row";
import { Stars } from "@/components/child/stars";
import { Sprout } from "@/components/illustrations";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Progress · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * Served at /progress for a child device (see proxy.ts). A map of stars for the topics they have worked
 * on (never a percentage), their mocks, a place for badges, and the way back to their mistakes.
 */
export default async function ChildProgressPage() {
  const child = await requireChild();
  const progress = await getChildProgress(child);
  if (progress.topics.length === 0 && progress.recentResults.length === 0) {
    return (
      <ChildEmptyState title="Progress" illustration={<Sprout className="h-28 w-auto sm:h-32" />}>
        Your progress will show here after your first mock.
      </ChildEmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ChildTitle>Progress</ChildTitle>

      {progress.topics.length > 0 ? (
        <section aria-labelledby="map-heading" className="flex flex-col gap-3">
          <ChildSectionTitle id="map-heading">My topics</ChildSectionTitle>
          <ul data-topic-map className="grid gap-4 sm:grid-cols-2">
            {progress.topics.map((topic) => (
              <li key={topic.topicId} data-topic-card className="flex flex-col gap-3 rounded-3xl border border-child-line bg-child-card p-5 shadow-child">
                <span className="text-xl font-bold leading-snug text-ink">{topic.label}</span>
                <Stars count={topic.stars} size="lg" />
                <span className="text-lg text-ink-soft">{topic.word}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {progress.mistakes ? (
        <section aria-labelledby="mistakes-heading" className="flex flex-col gap-3">
          <ChildSectionTitle id="mistakes-heading">Mistakes to fix</ChildSectionTitle>
          <ChildRowLink
            href={progress.mistakes.href}
            icon={<Lightbulb />}
            tone="kaya"
            title={progress.mistakes.label}
            detail={progress.mistakes.count === 1 ? "1 mistake" : `${progress.mistakes.count} mistakes`}
            action="Review mistakes"
          />
        </section>
      ) : null}

      {progress.recentResults.length > 0 ? (
        <section aria-labelledby="mocks-heading" className="flex flex-col gap-3">
          <ChildSectionTitle id="mocks-heading">Your mocks</ChildSectionTitle>
          <ul className="flex flex-col gap-3">
            {progress.recentResults.map((result) => (
              <li key={result.attemptId}>
                <ChildRowLink href={result.href} icon={<Star />} tone="teal" title={result.label} value={result.scoreText} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ChildCard className="flex items-center gap-4">
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-kaya-soft text-kaya-strong">
          <Medal className="h-7 w-7" strokeWidth={2.25} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <ChildSectionTitle>Achievements</ChildSectionTitle>
          <p className="text-lg text-ink-soft">Badges you earn will show up here.</p>
        </div>
      </ChildCard>

      <div>
        <ButtonLink href="/practice" variant="quiet" size="lg" shape="pill" flush>
          Go to Practice
        </ButtonLink>
      </div>
    </div>
  );
}
