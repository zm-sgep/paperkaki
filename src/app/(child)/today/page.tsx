import type { Metadata } from "next";
import { getChildToday } from "@/application/queries/child-today";
import { requireChild } from "@/application/queries/current-child";
import { getPointsGlance } from "@/application/queries/rewards";
import Link from "next/link";
import { ChildHero } from "@/components/child/child-card";
import { startRecommendedAction } from "../practice/actions";

export const metadata: Metadata = { title: "Today · PaperKaki" };
export const dynamic = "force-dynamic";

/** Today is one mission with one button, and at most one quiet line of context. Never a menu. */
export default async function TodayPage() {
  const child = await requireChild();
  const { action, countdownLine } = await getChildToday(child);
  // Points sit quietly under the mission, and never on a mock's card: a mock is done with nothing else around it.
  const isMock = action.kind === "start_mock" || action.kind === "resume_mock";
  const glance = isMock ? null : await getPointsGlance(child);
  return (
    <>
      <ChildHero
        overline={action.kind === "done_today" ? undefined : "Your next mission"}
        title={action.title}
        supportingText={action.supportingText}
        ctaLabel={action.ctaLabel}
        href={action.href}
        {...(action.kind === "start_practice" ? { action: startRecommendedAction } : {})}
      />
      {countdownLine ? <p className="text-xl text-ink-soft">{countdownLine}</p> : null}
      {glance?.justEarned ? (
        <p data-just-earned className="text-xl text-ink">
          {glance.justEarned}
        </p>
      ) : null}
      {glance && (glance.balance > 0 || glance.nearest) ? (
        <Link
          href="/rewards"
          data-points-glance
          className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 border-child-line bg-child-card px-4 py-2 text-lg text-ink hover:border-kaki"
        >
          <span>
            <span className="font-bold text-kaki-strong">{glance.balance}</span> Learning {glance.balance === 1 ? "Point" : "Points"}
          </span>
          {glance.nearest ? (
            <span className="text-ink-soft">
              <span aria-hidden="true">{glance.nearest.symbol} </span>
              {glance.nearest.title}: {glance.nearest.text}
            </span>
          ) : null}
        </Link>
      ) : null}
    </>
  );
}
