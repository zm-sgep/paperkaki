import type { Metadata } from "next";
import Link from "next/link";
import { requireChild } from "@/application/queries/current-child";
import { getChildProgress } from "@/application/queries/progress";
import { ChildCard, ChildEmptyState } from "@/components/child/child-card";
import { Stars } from "@/components/child/stars";
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
    return <ChildEmptyState title="Progress">Your progress will show here after your first mock.</ChildEmptyState>;
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Progress</h1>

      {progress.topics.length > 0 ? (
        <section aria-labelledby="map-heading" className="flex flex-col gap-3">
          <h2 id="map-heading" className="text-2xl font-semibold text-ink">
            My topics
          </h2>
          <ul data-topic-map className="grid gap-4 sm:grid-cols-2">
            {progress.topics.map((topic) => (
              <li key={topic.topicId} data-topic-card className="flex flex-col gap-2 rounded-3xl border-2 border-child-line bg-child-card p-5">
                <span className="text-xl font-semibold text-ink">{topic.label}</span>
                <Stars count={topic.stars} />
                <span className="text-lg text-ink-soft">{topic.word}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {progress.mistakes ? (
        <ChildCard className="flex flex-col items-start gap-3">
          <h2 className="text-2xl font-semibold text-ink">Mistakes to fix</h2>
          <p className="text-xl text-ink-soft">
            {progress.mistakes.label}: {progress.mistakes.count === 1 ? "1 mistake" : `${progress.mistakes.count} mistakes`}
          </p>
          <ButtonLink href={progress.mistakes.href} variant="secondary" className="min-h-14 rounded-2xl px-8 text-xl">
            Review mistakes
          </ButtonLink>
        </ChildCard>
      ) : null}

      {progress.recentResults.length > 0 ? (
        <ChildCard className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-ink">Your mocks</h2>
          <ul className="flex flex-col">
            {progress.recentResults.map((result) => (
              <li key={result.attemptId} className="border-b-2 border-child-line last:border-b-0">
                <Link href={result.href} className="flex min-h-16 items-center justify-between gap-3 py-2 text-xl text-ink hover:underline">
                  <span>{result.label}</span>
                  <span className="text-2xl font-semibold">{result.scoreText}</span>
                </Link>
              </li>
            ))}
          </ul>
        </ChildCard>
      ) : null}

      <ChildCard className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-ink">Achievements</h2>
        <p className="text-xl text-ink-soft">Badges you earn will show up here.</p>
      </ChildCard>

      <div>
        <ButtonLink href="/practice" variant="quiet" className="min-h-14 rounded-2xl px-6 text-lg">
          Go to Practice
        </ButtonLink>
      </div>
    </div>
  );
}
