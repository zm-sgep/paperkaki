import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPracticeRun } from "@/application/queries/practice";
import { requireChild } from "@/application/queries/current-child";
import { ChildCta, ChildHero } from "@/components/child/child-card";
import { PointsEarned } from "@/components/child/points-earned";
import { CheckCircleBurst } from "@/components/illustrations";
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
        illustration={<CheckCircleBurst className="h-28 w-auto md:h-44" />}
        title={run.endText}
        // The heading is about the practice just done, so the next mission is named as what comes next,
        // and a bare "Start" says what it starts.
        supportingText={run.next.kind === "done_today" ? run.next.title : `Next: ${run.next.title}`}
        ctaLabel={
          run.next.ctaLabel === "Start" ? (run.next.kind === "start_mock" ? "Start mock" : "Start practice") : run.next.ctaLabel
        }
        href={run.next.href}
      >
        <PointsEarned reward={run.reward} />
      </ChildHero>
    );
  }

  if (run.state === "finish") {
    return (
      <ChildHero
        illustration={<CheckCircleBurst className="h-28 w-auto md:h-44" />}
        title="That was the last question"
        supportingText={`Well done for finishing your ${run.focusLabel} practice.`}
        cta={
          <form action={finishAction.bind(null, sessionId)} className="w-full sm:w-auto">
            <ChildCta>Finish</ChildCta>
          </form>
        }
      />
    );
  }

  return <PracticeRunner key={run.question.position} sessionId={sessionId} focusLabel={run.focusLabel} progressText={run.progressText} dots={run.dots} question={run.question} />;
}
