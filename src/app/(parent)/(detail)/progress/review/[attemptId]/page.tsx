import type { Metadata } from "next";
import { ClipboardCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireParent } from "@/application/queries/current-parent";
import { getQuickCheck } from "@/application/queries/results";
import { QuestionView } from "@/components/paper/QuestionView";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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
      <header className="flex flex-col items-start gap-2">
        <Chip tone="kaya" icon={<ClipboardCheck />}>
          {check.progressText}
        </Chip>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink sm:text-[2rem]">We need a quick check on Question {check.position}.</h1>
        <p className="text-lg text-ink-soft">Look at {check.childNickname}&apos;s answer, then choose the mark.</p>
      </header>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">The question</h2>
        <QuestionView content={check.content} marks={check.marks} imageUrls={check.imageUrls} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">{check.childNickname}&apos;s answer</h2>
        <p data-child-answer className="rounded-xl bg-paper px-4 py-3 text-xl font-semibold text-ink">
          {check.childAnswer}
        </p>
        {check.workingUrl ? (
          // Private picture served through the app after an ownership check, so next/image would only proxy it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={check.workingUrl} alt={`${check.childNickname}'s working for Question ${check.position}`} className="w-full max-w-2xl rounded-xl border border-line bg-white" />
        ) : (
          <p className="text-base text-ink-soft">No working was written.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">The right answer</h2>
        <p className="rounded-xl bg-kaki-soft px-4 py-3 text-xl font-semibold text-ink">{check.correctAnswer}</p>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-ink">How it is marked</h3>
          <ul className="list-disc pl-6 text-base text-ink marker:text-kaki">
            {check.scheme.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </Card>

      {check.suggestion ? (
        <div className="flex items-start gap-3 rounded-card border border-kaya/40 bg-kaya-soft p-5">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kaya text-ink">
            <Sparkles className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="flex flex-col gap-1">
            <p data-suggestion className="text-lg font-bold text-ink">
              We suggest {check.suggestion.score} out of {check.marks}.
            </p>
            <p className="text-base text-ink">{check.suggestion.reason}</p>
          </div>
        </div>
      ) : null}

      <Card key={check.paperQuestionId} className="flex flex-col gap-4 border-kaki/25 shadow-hero">
        <ReviewForm
          attemptId={attemptId}
          paperQuestionId={check.paperQuestionId}
          choices={check.choices}
          marks={check.marks}
          suggested={check.suggestion?.score ?? null}
        />
      </Card>

      <div>
        <Link href="/home" className={buttonClassName("quiet", "md", { flush: true })}>
          Back to Home
        </Link>
      </div>
    </>
  );
}
