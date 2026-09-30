import type { Metadata } from "next";
import { BookOpenCheck, Lightbulb } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireChild } from "@/application/queries/current-child";
import { getMarkedPaper, getMarkingStatus } from "@/application/queries/results";
import { ChildBackLink, ChildCard } from "@/components/child/child-card";
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
      <div className="flex flex-col items-start gap-3">
        <ChildBackLink href={`/results/${attemptId}`}>Back to my results</ChildBackLink>
        <div className="flex flex-col items-start gap-2">
          <p className="text-lg font-semibold text-ink-soft">{paper.label}</p>
          <h1 data-mistake-heading className="text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
            Mistake {number} of {mistakes.length}
          </h1>
        </div>
      </div>

      <ChildCard className="flex flex-col gap-6">
        <QuestionView content={entry.content} imageUrls={paper.imageUrls} className="text-xl" />
        <div className="flex flex-col gap-2 rounded-2xl border border-coral/30 bg-coral-soft p-4 sm:p-5">
          <p className="text-base font-semibold text-coral-strong">Your answer</p>
          <p data-answer-line className="text-2xl font-bold text-ink">
            {entry.answerLine}
          </p>
          {entry.workingUrl ? (
            // Private picture served through the app after an ownership check, so next/image would only proxy it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.workingUrl} alt={`Your working for Question ${entry.position}`} className="mt-1 w-full max-w-xl rounded-xl border border-child-line bg-white" />
          ) : null}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-kaki/25 bg-kaki-soft p-4 sm:p-5">
          <h2 className="flex items-center gap-2.5 text-2xl font-extrabold text-ink">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kaki text-white">
              <Lightbulb className="h-5 w-5" strokeWidth={2.25} />
            </span>
            Here is how
          </h2>
          <p data-what-happened className="text-xl text-ink">
            {entry.whatHappened}
          </p>
          {entry.explanation ? <p className="text-xl text-ink">{entry.explanation}</p> : null}
          <div data-worked-solution className="rounded-xl bg-child-card p-4 text-xl text-ink">
            <BlockListView blocks={entry.workedSolution} imageUrls={paper.imageUrls} />
          </div>
          <p className="flex items-center gap-2.5 text-xl text-ink">
            <BookOpenCheck aria-hidden="true" className="h-6 w-6 shrink-0 text-kaki-strong" strokeWidth={2.25} />
            <span>
              <span className="font-bold">Answer: </span>
              {entry.correctAnswer}
            </span>
          </p>
        </div>
      </ChildCard>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {last ? (
          <form action={finishMistakesAction.bind(null, attemptId)} className="w-full sm:w-auto">
            <SubmitButton variant="primary" size="xl" shape="pill" className="w-full sm:w-auto">
              I&apos;ve fixed my mistakes
            </SubmitButton>
          </form>
        ) : (
          <ButtonLink href={`/results/${attemptId}/mistakes?n=${number + 1}`} variant="primary" size="xl" shape="pill" className="w-full sm:w-auto">
            Next mistake
          </ButtonLink>
        )}
        <form action={tryOneLikeThisAction.bind(null, attemptId, number)} className="w-full sm:w-auto">
          <input type="hidden" name="outcomeId" value={entry.outcomeId} />
          <input type="hidden" name="questionId" value={entry.questionId} />
          <SubmitButton variant="secondary" size="lg" shape="pill" className="w-full sm:w-auto">
            Try one like this
          </SubmitButton>
        </form>
        {number > 1 ? (
          <ButtonLink href={`/results/${attemptId}/mistakes?n=${number - 1}`} variant="quiet" size="lg" shape="pill">
            Previous mistake
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
