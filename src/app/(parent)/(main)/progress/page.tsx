import { ChevronDown, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getParentProgress } from "@/application/queries/progress";
import { requireParent } from "@/application/queries/current-parent";
import { Sprout } from "@/components/illustrations";
import { StateChip } from "@/components/parent/state-chip";
import { ActionCard } from "@/components/ui/action-card";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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

  if (progress.kind === "no_child") {
    return (
      <>
        <PageHeader title="Progress" />
        <EmptyState title="Nothing to show yet" illustration={<Sprout className="h-28 w-auto sm:h-32" />}>
          After your child&apos;s first mock, you&apos;ll see what is improving and what needs work.
        </EmptyState>
      </>
    );
  }
  if (progress.kind === "empty") {
    return (
      <>
        <PageHeader title="Progress" />
        <EmptyState
          title="Nothing to show yet"
          illustration={<Sprout className="h-28 w-auto sm:h-32" />}
          action={
            <ButtonLink href="/home" variant="secondary">
              Back to Home
            </ButtonLink>
          }
        >
          After {progress.childNickname}&apos;s first mock or practice, you&apos;ll see what is improving and what needs work.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Progress" description={progress.childNickname} />

      <ActionCard illustration={<Sprout className="h-24 w-auto md:h-32" />}>
        <p data-summary className="text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
          {progress.sentence}
        </p>
        {progress.action.kind === "start_practice" ? (
          progress.action.supportingText ? <p className="text-lg text-ink-soft">{progress.action.supportingText}</p> : null
        ) : (
          <p className="text-lg text-ink-soft">{progress.action.title}</p>
        )}
        <ButtonLink href={progress.action.href} variant="primary" size="lg" className="mt-1 w-full sm:w-auto">
          {progress.action.ctaLabel}
        </ButtonLink>
      </ActionCard>

      <section aria-labelledby="topics-heading" className="flex flex-col gap-3">
        <h2 id="topics-heading" className="text-xl font-bold tracking-tight text-ink">
          How each topic is going
        </h2>
        <ul data-topic-states className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {progress.topics.map((topic) => (
            <li key={topic.topicId} className="border-b border-line last:border-b-0">
              <Link href={topic.href} className="flex min-h-16 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-kaki-soft focus-visible:-outline-offset-3">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-lg font-semibold leading-snug text-ink">{topic.label}</span>
                  <span className="text-base text-ink-soft">{topic.evidence}</span>
                </span>
                <StateChip state={topic.state} word={topic.word} marker />
                <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" strokeWidth={2.25} />
              </Link>
            </li>
          ))}
        </ul>
        {progress.notStarted.length > 0 ? (
          <details className="group/details rounded-card border border-line bg-surface px-4 shadow-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-lg text-ink [&::-webkit-details-marker]:hidden">
              {progress.notStarted.length === 1 ? "1 topic not started yet" : `${progress.notStarted.length} topics not started yet`}
              <ChevronDown aria-hidden="true" className="h-5 w-5 text-ink-soft transition-transform group-open/details:rotate-180" strokeWidth={2.5} />
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
          <h2 className="text-xl font-bold tracking-tight text-ink">Recent mocks</h2>
          <ul data-recent-results className="flex flex-col">
            {progress.recentResults.map((result) => (
              <li key={result.attemptId} className="border-b border-line last:border-b-0">
                <Link href={result.href} className="flex min-h-16 items-center justify-between gap-3 py-2 text-lg text-ink hover:underline">
                  <span>
                    {result.label}
                    <span className="block text-base text-ink-soft">{result.childNickname}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span data-numeric className="text-2xl font-extrabold tracking-tight">
                      {result.scoreText}
                    </span>
                    <ChevronRight aria-hidden="true" className="h-5 w-5 text-ink-soft" strokeWidth={2.25} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {progress.trend.length > 0 ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl font-bold tracking-tight text-ink">Mock marks over time</h2>
          <ol data-trend className="flex flex-col gap-4">
            {progress.trend.map((point) => (
              <li key={point.label} className="flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3 text-lg text-ink">
                  <span>{point.label}</span>
                  <span data-numeric className="font-bold">
                    {point.scoreText}
                  </span>
                </span>
                <span aria-hidden="true" className="block h-2.5 rounded-full bg-line">
                  <span className="block h-2.5 rounded-full bg-kaki" style={{ width: `${Math.round(point.ratio * 100)}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {progress.patterns.length > 0 ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-xl font-bold tracking-tight text-ink">What tends to go wrong</h2>
          <ul data-patterns className="flex flex-col text-lg text-ink">
            {progress.patterns.map((pattern) => (
              <li key={pattern.kind} className="flex min-h-12 items-center justify-between gap-3 border-b border-line last:border-b-0">
                <span>{pattern.label}</span>
                <Chip tone="coral">{pattern.count === 1 ? "1 question" : `${pattern.count} questions`}</Chip>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <details data-detail className="group/details rounded-card border border-line bg-surface px-5 py-1 shadow-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-lg font-bold text-ink [&::-webkit-details-marker]:hidden">
          Detailed breakdown
          <ChevronDown aria-hidden="true" className="h-5 w-5 text-ink-soft transition-transform group-open/details:rotate-180" strokeWidth={2.5} />
        </summary>
        <div className="flex flex-col gap-5 pb-4 pt-1">
          {progress.detail.map((topic) => (
            <div key={topic.topicId} className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-ink">{topic.label}</h3>
              <ul className="flex flex-col text-lg text-ink">
                {topic.outcomes.map((outcome) => (
                  <li key={outcome.label} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                    <span>{outcome.label}</span>
                    <StateChip word={outcome.word} />
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
