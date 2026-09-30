import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireChild } from "@/application/queries/current-child";
import { getMarkedPaper, getMarkingStatus } from "@/application/queries/results";
import { ChildCard } from "@/components/child/child-card";
import { BlockListView, QuestionView } from "@/components/paper/QuestionView";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { finishMistakesAction, tryOneLikeThisAction } from "./actions";

export const metadata: Metadata = { title: "Your mistakes · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * The child's wrong mock questions, one at a time: the question, what they wrote, and how it works. Each
 * has "Try one like this"; the last one has one clear way to finish, which is what Today and rewards
 * later read as "mistakes gone through". The place is kept in the address, so it survives a reload.
 */
export default async function MistakesPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  const child = await requireChild();
  const { attemptId } = await params;
  const { n } = await searchParams;
  const paper = await getMarkedPaper({ kind: "child", childId: child.childId }, attemptId);
  if (!paper) {
    if (await getMarkingStatus({ childId: child.childId }, attemptId)) redirect(`/results/${attemptId}`);
    notFound();
  }
  const mistakes = paper.entries.filter((entry) => entry.mistake);
  if (mistakes.length === 0) redirect(`/results/${attemptId}`);

  const number = Math.min(mistakes.length, Math.max(1, Number.parseInt(n ?? "1", 10) || 1));
  const entry = mistakes[number - 1] as (typeof mistakes)[number];
  const last = number === mistakes.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/results/${attemptId}`} className="inline-flex min-h-12 items-center text-base font-semibold text-kaki underline underline-offset-4">
          Back to my results
        </Link>
        <h1 data-mistake-heading className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Mistake {number} of {mistakes.length}
        </h1>
        <p className="text-lg text-ink-soft">{paper.label}</p>
      </div>

      <ChildCard className="flex flex-col gap-5">
        <QuestionView content={entry.content} imageUrls={paper.imageUrls} className="text-xl" />
        <div className="flex flex-col gap-1 border-t-2 border-child-line pt-4">
          <p className="text-base text-ink-soft">Your answer</p>
          <p data-answer-line className="text-2xl text-ink">
            {entry.answerLine}
          </p>
          {entry.workingUrl ? (
            // Private picture served through the app after an ownership check, so next/image would only proxy it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.workingUrl} alt={`Your working for Question ${entry.position}`} className="w-full max-w-xl rounded-xl border-2 border-child-line bg-white" />
          ) : null}
        </div>
        <div className="flex flex-col gap-2 border-t-2 border-child-line pt-4">
          <h2 className="text-2xl font-semibold text-ink">Here is how</h2>
          <p data-what-happened className="text-xl text-ink">
            {entry.whatHappened}
          </p>
          {entry.explanation ? <p className="text-xl text-ink">{entry.explanation}</p> : null}
          <div data-worked-solution className="text-xl text-ink">
            <BlockListView blocks={entry.workedSolution} imageUrls={paper.imageUrls} />
          </div>
          <p className="text-xl text-ink">
            <span className="font-semibold">Answer: </span>
            {entry.correctAnswer}
          </p>
        </div>
      </ChildCard>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {last ? (
          <form action={finishMistakesAction.bind(null, attemptId)} className="w-full sm:w-auto">
            <SubmitButton variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
              I&apos;ve fixed my mistakes
            </SubmitButton>
          </form>
        ) : (
          <ButtonLink href={`/results/${attemptId}/mistakes?n=${number + 1}`} variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
            Next mistake
          </ButtonLink>
        )}
        <form action={tryOneLikeThisAction.bind(null, attemptId, number)} className="w-full sm:w-auto">
          <input type="hidden" name="outcomeId" value={entry.outcomeId} />
          <input type="hidden" name="questionId" value={entry.questionId} />
          <SubmitButton variant="secondary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
            Try one like this
          </SubmitButton>
        </form>
        {number > 1 ? (
          <ButtonLink href={`/results/${attemptId}/mistakes?n=${number - 1}`} variant="quiet" className="min-h-14 rounded-2xl px-6 text-lg">
            Previous mistake
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
