import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPracticeRun } from "@/application/queries/practice";
import { requireChild } from "@/application/queries/current-child";
import { ChildHero } from "@/components/child/child-card";
import { PointsEarned } from "@/components/child/points-earned";
import { SubmitButton } from "@/components/ui/submit-button";
import { finishAction } from "./actions";
import { PracticeRunner } from "./practice-runner";

export const metadata: Metadata = { title: "Practice · PaperKaki" };
export const dynamic = "force-dynamic";

/** The practice set: the next question, a quiet "finish" if every question is done, or the calm end screen. */
export default async function PracticeSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const child = await requireChild();
  const { sessionId } = await params;
  const run = await getPracticeRun(child, sessionId);
  if (!run) notFound();

  if (run.state === "done") {
    return (
      <ChildHero
        title={run.endText}
        supportingText={run.next.title}
        ctaLabel={run.next.ctaLabel}
        href={run.next.href}
      >
        <PointsEarned reward={run.reward} />
      </ChildHero>
    );
  }

  if (run.state === "finish") {
    return (
      <section className="flex flex-col items-start gap-4 rounded-3xl border-2 border-kaki/30 bg-kaki-soft p-6 sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">That was the last question</h1>
        <p className="text-xl text-ink-soft">Well done for finishing your {run.focusLabel} practice.</p>
        <form action={finishAction.bind(null, sessionId)} className="w-full sm:w-auto">
          <SubmitButton variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
            Finish
          </SubmitButton>
        </form>
      </section>
    );
  }

  return <PracticeRunner key={run.question.position} sessionId={sessionId} focusLabel={run.focusLabel} progressText={run.progressText} dots={run.dots} question={run.question} />;
}
