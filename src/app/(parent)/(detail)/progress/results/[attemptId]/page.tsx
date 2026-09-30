import { ArrowRight, Flag, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markResultSeenByParent } from "@/application/commands/marking-review";
import { requireParent } from "@/application/queries/current-parent";
import { getMarkingStatus, getParentResult } from "@/application/queries/results";
import { Sprout } from "@/components/illustrations";
import { ActionCard } from "@/components/ui/action-card";
import { ButtonLink, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import { MarkingProgress } from "./marking-progress";
import { RetryForm } from "./retry-form";

export const metadata: Metadata = { title: "Results · PaperKaki" };
export const dynamic = "force-dynamic";

/** How the score moved, as a chip. The words carry the meaning; the tint and arrow only support them. */
const CHANGE_CHIP = {
  first: { tone: "teal", Icon: Flag },
  up: { tone: "teal", Icon: TrendingUp },
  down: { tone: "coral", Icon: TrendingDown },
  same: { tone: "neutral", Icon: Minus },
  different_total: { tone: "neutral", Icon: Minus },
} as const satisfies Record<string, { tone: ChipTone; Icon: typeof Flag }>;

/** A topic's state as a chip, in the same words the table always used. */
const STATUS_TONE: Record<string, ChipTone> = { strong: "teal", getting_there: "kaya", needs_attention: "coral" };

/**
 * A mock's results, in this order: the score, what changed, what needs attention, one recommended
 * next action, the topic table, and the marked paper. Until the paper is marked it says where marking
 * is; it never shows the child's paper. Lives outside (main) so a paper that is not theirs answers 404.
 */
export default async function ResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const parent = await requireParent();
  const { attemptId } = await params;
  const scope = { parentProfileId: parent.parentProfileId };
  const status = await getMarkingStatus(scope, attemptId);
  if (!status) notFound();

  if (status.state === "marking" || status.state === "failed") {
    const failed = status.state === "failed";
    return (
      <>
        <p className="-mb-3 text-base text-ink-soft">{status.label}</p>
        <PageHeader
          title={failed ? "We couldn't read the paper yet" : `We're marking ${status.childNickname}'s Mock ${status.mockNumber}`}
          description={failed ? "Your pages are saved. Nothing needs to be uploaded again." : "This usually takes a minute. You can stay on this page."}
        />
        <MarkingProgress attemptId={attemptId} steps={status.steps} live={!failed} />
        {failed ? <RetryForm attemptId={attemptId} /> : null}
        <div>
          <Link href="/home" className={buttonClassName("quiet", "md", { flush: true })}>
            Back to Home
          </Link>
        </div>
      </>
    );
  }

  if (status.state === "needs_check") {
    return (
      <>
        <p className="-mb-3 text-base text-ink-soft">{status.label}</p>
        <PageHeader
          title={status.waitingCount === 1 ? "We need a quick check on 1 answer" : `We need a quick check on ${status.waitingCount} answers`}
          description={`We weren't sure how to mark some of ${status.childNickname}'s answers. It takes about a minute, and then the results are ready.`}
        />
        <div>
          <ButtonLink href={`/progress/review/${attemptId}`} variant="primary" className="w-full sm:w-auto">
            Check answers
          </ButtonLink>
        </div>
      </>
    );
  }

  const result = await getParentResult(parent.parentProfileId, attemptId);
  if (!result) notFound();
  await markResultSeenByParent(parent.parentProfileId, attemptId);

  const change = CHANGE_CHIP[result.change.kind];
  const ChangeIcon = change.Icon;

  return (
    <>
      <Card className="flex flex-col gap-4">
        <p className="text-base text-ink-soft">
          {result.childNickname} · {result.label}
        </p>
        <h1 data-score data-numeric className="text-6xl font-extrabold leading-none tracking-tight text-ink sm:text-7xl">
          <span className="sr-only">Score: </span>
          {result.scoreText}
        </h1>
        <div className="flex flex-col items-start gap-2">
          <div data-change>
            <Chip tone={change.tone} icon={<ChangeIcon />} className="text-base">
              {result.change.text}
            </Chip>
          </div>
          {result.overTime ? <p className="text-base text-ink-soft">{result.overTime}</p> : null}
        </div>
      </Card>

      <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
        <h2 id="attention-heading" className="text-xl font-bold tracking-tight text-ink">
          What needs attention
        </h2>
        {result.attention.length > 0 ? (
          <ul data-attention className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
            {result.attention.map((topic) => (
              <li key={topic.topicId} className="flex items-center gap-3 border-b border-line px-4 py-3.5 text-lg text-ink last:border-b-0">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral-soft">
                  <span className="h-2.5 w-2.5 rounded-full bg-coral" />
                </span>
                <span>{topic.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg text-ink">Nothing stood out. Every topic went well.</p>
        )}
      </section>

      <ActionCard illustration={<Sprout className="h-24 w-auto md:h-32" />}>
        <h2 data-next-action className="text-2xl font-bold leading-tight tracking-tight text-ink">
          {result.nextAction.title}
        </h2>
        {result.nextAction.supportingText ? <p className="text-lg text-ink-soft">{result.nextAction.supportingText}</p> : null}
        <ButtonLink href={result.nextAction.href} variant="primary" size="lg" className="mt-1 w-full sm:w-auto">
          {result.nextAction.ctaLabel}
        </ButtonLink>
      </ActionCard>

      <section aria-labelledby="topics-heading" className="flex flex-col gap-3">
        <h2 id="topics-heading" className="text-xl font-bold tracking-tight text-ink">
          By topic
        </h2>
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <table data-topics className="w-full border-collapse text-left text-lg">
            <thead>
              <tr className="border-b border-line bg-paper text-base text-ink-soft">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Topic
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Marks
                </th>
                <th scope="col" className="hidden px-4 py-3 font-semibold sm:table-cell">
                  How it went
                </th>
              </tr>
            </thead>
            <tbody>
              {result.topics.map((topic) => (
                <tr key={topic.topicId} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-4 py-3.5 font-semibold text-ink">
                    {topic.label}
                    <span className="mt-1.5 block sm:hidden">
                      <Chip tone={STATUS_TONE[topic.status] ?? "neutral"}>{topic.statusText}</Chip>
                    </span>
                  </th>
                  <td data-numeric className="whitespace-nowrap px-4 py-3.5 align-top text-ink sm:align-middle">
                    {topic.marks}/{topic.maxMarks}
                  </td>
                  <td className="hidden px-4 py-3.5 sm:table-cell">
                    <Chip tone={STATUS_TONE[topic.status] ?? "neutral"}>{topic.statusText}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="mistakes" aria-label="Marked paper" className="flex scroll-mt-24 flex-col items-start gap-3">
        <p className="text-lg text-ink-soft">
          {result.mistakeCount === 0
            ? "Every question was right."
            : result.mistakeCount === 1
              ? "1 question to go through together."
              : `${result.mistakeCount} questions to go through together.`}
        </p>
        <ButtonLink href={result.markedPaperHref} variant="secondary" className="w-full sm:w-auto">
          Marked paper
          <ArrowRight aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />
        </ButtonLink>
      </section>
    </>
  );
}
