import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { markResultSeenByChild } from "@/application/commands/marking-review";
import { requireChild } from "@/application/queries/current-child";
import { getMockReward } from "@/application/queries/rewards";
import { getChildResult, getMarkingStatus } from "@/application/queries/results";
import { ChildHero, ChildSectionTitle } from "@/components/child/child-card";
import { PointsEarned } from "@/components/child/points-earned";
import { CheckCircleBurst, PaperStack } from "@/components/illustrations";
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
        illustration={<PaperStack className="h-28 w-auto md:h-44" />}
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
      <section className="relative overflow-hidden rounded-hero border border-kaki/20 bg-linear-to-br from-kaki-soft from-55% to-child-card p-6 shadow-child-hero motion-safe:animate-enter sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col items-start gap-3">
            <p className="text-lg font-semibold text-ink-soft">{result.label}</p>
            <h1 data-score className="text-7xl font-extrabold leading-none tracking-tight text-kaki-strong sm:text-8xl">
              <span className="sr-only">Your score: </span>
              {result.scoreText}
            </h1>
            <p data-headline className="pt-1 text-2xl font-bold leading-snug text-ink">
              {result.headline}
            </p>
          </div>
          <div aria-hidden="true" className="hidden shrink-0 sm:block">
            <CheckCircleBurst className="h-32 w-auto md:h-44" />
          </div>
        </div>
      </section>

      <PointsEarned reward={reward} />

      {result.thingsToLearn.length > 0 ? (
        <section aria-labelledby="learn-heading" className="flex flex-col gap-3">
          <ChildSectionTitle id="learn-heading">Good things to learn next</ChildSectionTitle>
          <ul data-things className="flex flex-col gap-3">
            {result.thingsToLearn.map((thing, index) => (
              <li key={thing} className="flex items-center gap-4 rounded-3xl border border-child-line bg-child-card p-4 text-xl font-semibold leading-snug text-ink shadow-child">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-kaya text-xl font-extrabold text-ink">
                  {index + 1}
                </span>
                <span>{thing}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col items-start gap-3">
        {result.mistakeCount > 0 ? (
          <ButtonLink href={result.reviewHref} variant="primary" size="xl" shape="pill" className="w-full sm:w-auto">
            Review mistakes
          </ButtonLink>
        ) : (
          <ButtonLink href="/today" variant="primary" size="xl" shape="pill" className="w-full sm:w-auto">
            Back to Today
          </ButtonLink>
        )}
        <ButtonLink href={`/results/${result.attemptId}/paper`} variant="quiet" size="lg" shape="pill" flush>
          See my whole paper
        </ButtonLink>
      </div>
    </>
  );
}
