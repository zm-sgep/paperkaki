import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireParent } from "@/application/queries/current-parent";
import { getQuickCheck } from "@/application/queries/results";
import { QuestionView } from "@/components/paper/QuestionView";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Quick check · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * The parent's quick check: one answer at a time, with the question, what the child wrote, their
 * working, the right answer and the marking scheme in plain words. When none is left, the results.
 */
export default async function QuickCheckPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const parent = await requireParent();
  const { attemptId } = await params;
  const check = await getQuickCheck(parent.parentProfileId, attemptId);
  if (!check) notFound();
  if (check.state === "marking") redirect(`/progress/results/${attemptId}`);
  if (check.state === "done") redirect(`/progress/results/${attemptId}`);

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-base text-ink-soft">{check.progressText}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">We need a quick check on Question {check.position}.</h1>
        <p className="text-lg text-ink-soft">Look at {check.childNickname}&apos;s answer, then choose the mark.</p>
      </header>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">The question</h2>
        <QuestionView content={check.content} marks={check.marks} imageUrls={check.imageUrls} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{check.childNickname}&apos;s answer</h2>
        <p data-child-answer className="text-xl text-ink">
          {check.childAnswer}
        </p>
        {check.workingUrl ? (
          // Private picture served through the app after an ownership check, so next/image would only proxy it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={check.workingUrl} alt={`${check.childNickname}'s working for Question ${check.position}`} className="w-full max-w-2xl rounded-lg border border-line bg-white" />
        ) : (
          <p className="text-base text-ink-soft">No working was written.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">The right answer</h2>
        <p className="text-xl text-ink">{check.correctAnswer}</p>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-ink">How it is marked</h3>
          <ul className="list-disc pl-6 text-base text-ink">
            {check.scheme.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </Card>

      {check.suggestion ? (
        <Card className="flex flex-col gap-1 border-kaki/40 bg-kaki-soft">
          <p data-suggestion className="text-lg font-semibold text-ink">
            We suggest {check.suggestion.score} out of {check.marks}.
          </p>
          <p className="text-base text-ink">{check.suggestion.reason}</p>
        </Card>
      ) : null}

      <Card key={check.paperQuestionId} className="flex flex-col gap-4">
        <ReviewForm
          attemptId={attemptId}
          paperQuestionId={check.paperQuestionId}
          choices={check.choices}
          marks={check.marks}
          suggested={check.suggestion?.score ?? null}
        />
      </Card>

      <div>
        <Link href="/home" className={buttonClassName("quiet")}>
          Back to Home
        </Link>
      </div>
    </>
  );
}
