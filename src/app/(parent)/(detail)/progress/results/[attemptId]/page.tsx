import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markResultSeenByParent } from "@/application/commands/marking-review";
import { requireParent } from "@/application/queries/current-parent";
import { getMarkingStatus, getParentResult } from "@/application/queries/results";
import { ButtonLink, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { MarkingProgress } from "./marking-progress";
import { RetryForm } from "./retry-form";

export const metadata: Metadata = { title: "Results · PaperKaki" };
export const dynamic = "force-dynamic";

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
          <Link href="/home" className={buttonClassName("quiet")}>
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
          title={status.waitingCount === 1 ? "1 answer needs a quick check" : `${status.waitingCount} answers need a quick check`}
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

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-base text-ink-soft">
          {result.childNickname} · {result.label}
        </p>
        <h1 data-score className="text-5xl font-semibold tracking-tight text-ink">
          <span className="sr-only">Score: </span>
          {result.scoreText}
        </h1>
        <p data-change className="text-xl text-ink">
          {result.change.text}
        </p>
        {result.overTime ? <p className="text-base text-ink-soft">{result.overTime}</p> : null}
      </div>

      <section aria-labelledby="attention-heading" className="flex flex-col gap-2">
        <h2 id="attention-heading" className="text-xl font-semibold text-ink">
          What needs attention
        </h2>
        {result.attention.length > 0 ? (
          <ul data-attention className="flex flex-col gap-2 text-lg text-ink">
            {result.attention.map((topic) => (
              <li key={topic.topicId} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-warning" />
                <span>{topic.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg text-ink">Nothing stood out. Every topic went well.</p>
        )}
      </section>

      <Card className="flex flex-col items-start gap-3 border-kaki/30 bg-kaki-soft">
        <h2 data-next-action className="text-2xl font-semibold tracking-tight text-ink">
          {result.nextAction.title}
        </h2>
        {result.nextAction.supportingText ? <p className="text-lg text-ink-soft">{result.nextAction.supportingText}</p> : null}
        <ButtonLink href={result.nextAction.href} variant="primary" className="w-full sm:w-auto">
          {result.nextAction.ctaLabel}
        </ButtonLink>
      </Card>

      <section aria-labelledby="topics-heading" className="flex flex-col gap-2">
        <h2 id="topics-heading" className="text-xl font-semibold text-ink">
          By topic
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table data-topics className="w-full border-collapse text-left text-lg">
            <thead>
              <tr className="border-b border-line text-base text-ink-soft">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Topic
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Marks
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  How it went
                </th>
              </tr>
            </thead>
            <tbody>
              {result.topics.map((topic) => (
                <tr key={topic.topicId} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-4 py-3 font-medium text-ink">
                    {topic.label}
                  </th>
                  <td className="px-4 py-3 text-ink">
                    {topic.marks}/{topic.maxMarks}
                  </td>
                  <td className="px-4 py-3 text-ink">{topic.statusText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="mistakes" aria-label="Marked paper" className="flex scroll-mt-24 flex-col items-start gap-2">
        <p className="text-lg text-ink-soft">
          {result.mistakeCount === 0
            ? "Every question was right."
            : result.mistakeCount === 1
              ? "1 question to go through together."
              : `${result.mistakeCount} questions to go through together.`}
        </p>
        <ButtonLink href={result.markedPaperHref} variant="secondary" className="w-full sm:w-auto">
          Marked paper
        </ButtonLink>
      </section>
    </>
  );
}
