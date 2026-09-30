import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { markResultSeenByChild } from "@/application/commands/marking-review";
import { requireChild } from "@/application/queries/current-child";
import { getMockReward } from "@/application/queries/rewards";
import { getChildResult, getMarkingStatus } from "@/application/queries/results";
import { ChildCard, ChildHero } from "@/components/child/child-card";
import { PointsEarned } from "@/components/child/points-earned";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your results · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * The child's results: the score, a warm sentence, one to three things worth learning, and one big
 * button to go through the mistakes. No comparison with anyone, and no label for how good they are.
 */
export default async function ChildResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const child = await requireChild();
  const { attemptId } = await params;
  const result = await getChildResult(child.childId, attemptId);
  if (!result) {
    // Handed in, but not marked yet: calm, and one way back. Anything else is not theirs.
    if (!(await getMarkingStatus({ childId: child.childId }, attemptId))) notFound();
    return (
      <ChildHero
        title="Your mock is being checked"
        supportingText="Your grown-up will look at a few answers, and then your results will be ready."
        ctaLabel="Back to Today"
        href="/today"
      />
    );
  }
  await markResultSeenByChild(child.childId, attemptId);
  // The paper is marked, so the mock has earned what it earns (tried again here if that did not finish earlier).
  const reward = await getMockReward(child, attemptId);

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-lg text-ink-soft">{result.label}</p>
        <h1 data-score className="text-6xl font-semibold tracking-tight text-kaki-strong">
          <span className="sr-only">Your score: </span>
          {result.scoreText}
        </h1>
        <p data-headline className="text-2xl text-ink">
          {result.headline}
        </p>
      </div>

      <PointsEarned reward={reward} />

      {result.thingsToLearn.length > 0 ? (
        <ChildCard className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold text-ink">Good things to learn next</h2>
          <ul data-things className="flex flex-col gap-2 text-xl text-ink">
            {result.thingsToLearn.map((thing) => (
              <li key={thing} className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-2.5 h-3 w-3 shrink-0 rounded-full bg-kaki" />
                <span>{thing}</span>
              </li>
            ))}
          </ul>
        </ChildCard>
      ) : null}

      <div className="flex flex-col items-start gap-3">
        {result.mistakeCount > 0 ? (
          <ButtonLink href={result.reviewHref} variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
            Review mistakes
          </ButtonLink>
        ) : (
          <ButtonLink href="/today" variant="primary" className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
            Back to Today
          </ButtonLink>
        )}
        <ButtonLink href={`/results/${result.attemptId}/paper`} variant="quiet" className="min-h-14 rounded-2xl px-6 text-lg">
          See my whole paper
        </ButtonLink>
      </div>
    </>
  );
}
