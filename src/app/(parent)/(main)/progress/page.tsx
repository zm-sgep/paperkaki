import type { Metadata } from "next";
import Link from "next/link";
import { getParentProgress } from "@/application/queries/progress";
import { requireParent } from "@/application/queries/current-parent";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Progress · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * Progress opens with one sentence and one next action, then the detail in the order a parent will want
 * it: how each topic is going (in plain words), recent mocks, how the marks are moving, what tends to go
 * wrong, and the detailed breakdown, closed. Never a wall of numbers.
 */
export default async function ProgressPage() {
  const parent = await requireParent();
  const progress = await getParentProgress(parent.parentProfileId);

  if (progress.kind !== "ready") {
    return (
      <>
        <PageHeader title="Progress" />
        <EmptyState
          title="Nothing to show yet"
          action={
            <ButtonLink href="/home" variant="secondary">
              Back to Home
            </ButtonLink>
          }
        >
          {progress.kind === "no_child"
            ? "Add your child and their next assessment, and you'll see how they are getting on here."
            : `After ${progress.childNickname}'s first mock or practice, you'll see what is improving and what needs work.`}
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Progress" description={progress.childNickname} />

      <Card className="flex flex-col items-start gap-3 border-kaki/30 bg-kaki-soft">
        <p data-summary className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {progress.sentence}
        </p>
        {progress.action.supportingText ? <p className="text-lg text-ink-soft">{progress.action.title}. {progress.action.supportingText}</p> : <p className="text-lg text-ink-soft">{progress.action.title}</p>}
        <ButtonLink href={progress.action.href} variant="primary" className="w-full sm:w-auto">
          {progress.action.ctaLabel}
        </ButtonLink>
      </Card>

      <section aria-labelledby="topics-heading" className="flex flex-col gap-2">
        <h2 id="topics-heading" className="text-xl font-semibold text-ink">
          How each topic is going
        </h2>
        <ul data-topic-states className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          {progress.topics.map((topic) => (
            <li key={topic.topicId} className="border-b border-line last:border-b-0">
              <Link href={topic.href} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-kaki-soft">
                <span className="text-lg font-semibold text-ink">{topic.label}</span>
                <span className="text-right">
                  <span data-state-word className="block text-lg font-semibold text-kaki-strong">
                    {topic.word}
                  </span>
                  <span className="block text-base text-ink-soft">{topic.evidence}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {progress.notStarted.length > 0 ? (
          <details className="rounded-2xl border border-line bg-surface px-4">
            <summary className="flex min-h-12 cursor-pointer items-center text-lg text-ink">
              {progress.notStarted.length === 1 ? "1 topic not started yet" : `${progress.notStarted.length} topics not started yet`}
            </summary>
            <ul className="flex flex-col pb-3 text-lg text-ink">
              {progress.notStarted.map((topic) => (
                <li key={topic.topicId} className="flex min-h-12 items-center justify-between gap-3">
                  <span>{topic.label}</span>
                  <span className="text-base text-ink-soft">Not started</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {progress.recentResults.length > 0 ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-ink">Recent mocks</h2>
          <ul data-recent-results className="flex flex-col">
            {progress.recentResults.map((result) => (
              <li key={result.attemptId} className="border-b border-line last:border-b-0">
                <Link href={result.href} className="flex min-h-14 items-center justify-between gap-3 py-2 text-lg text-ink hover:underline">
                  <span>
                    {result.label}
                    <span className="block text-base text-ink-soft">{result.childNickname}</span>
                  </span>
                  <span className="text-xl font-semibold">{result.scoreText}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {progress.trend.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-ink">Mock marks over time</h2>
          <ol data-trend className="flex flex-col gap-3">
            {progress.trend.map((point) => (
              <li key={point.label} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-3 text-lg text-ink">
                  <span>{point.label}</span>
                  <span className="font-semibold">{point.scoreText}</span>
                </span>
                <span aria-hidden="true" className="block h-2 rounded-full bg-line">
                  <span className="block h-2 rounded-full bg-kaki" style={{ width: `${Math.round(point.ratio * 100)}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {progress.patterns.length > 0 ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-ink">What tends to go wrong</h2>
          <ul data-patterns className="flex flex-col gap-1 text-lg text-ink">
            {progress.patterns.map((pattern) => (
              <li key={pattern.kind} className="flex items-center justify-between gap-3">
                <span>{pattern.label}</span>
                <span className="text-ink-soft">{pattern.count === 1 ? "1 question" : `${pattern.count} questions`}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <details data-detail className="rounded-2xl border border-line bg-surface px-4 py-1">
        <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold text-ink">Detailed breakdown</summary>
        <div className="flex flex-col gap-4 pb-4">
          {progress.detail.map((topic) => (
            <div key={topic.topicId} className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-ink">{topic.label}</h3>
              <ul className="flex flex-col text-lg text-ink">
                {topic.outcomes.map((outcome) => (
                  <li key={outcome.label} className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
                    <span>{outcome.label}</span>
                    <span className="text-ink-soft">{outcome.word}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
