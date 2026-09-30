import { CalendarDays, Clock, Gift, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getChildToday } from "@/application/queries/child-today";
import { requireChild } from "@/application/queries/current-child";
import { getPointsGlance } from "@/application/queries/rewards";
import { ChildIllustration } from "@/components/child/ChildIllustration";
import { childPillClassName, ChildHero } from "@/components/child/child-card";
import { Chip } from "@/components/ui/chip";
import { PRACTICE_SESSION_MINUTES } from "@/domain/recommendations/practice-focus";
import { startRecommendedAction } from "../practice/actions";

export const metadata: Metadata = { title: "Today · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * Today is one mission with one button, and at most one quiet line of context. Never a menu. When the
 * mission's line is only how long it takes, that shows as a chip under the title instead of a sentence.
 */
export default async function TodayPage() {
  const child = await requireChild();
  const { action, countdownLine } = await getChildToday(child);
  // Points sit quietly under the mission, and never on a mock's card: a mock is done with nothing else around it.
  const isMock = action.kind === "start_mock" || action.kind === "resume_mock";
  const glance = isMock ? null : await getPointsGlance(child);

  // A paper's line is its length ("45 min"); a plain practice set's is "About 15 minutes." Both read better as a chip.
  const onlyDuration =
    action.kind === "start_mock" || (action.kind === "start_practice" && action.supportingText === `About ${PRACTICE_SESSION_MINUTES} minutes.`);
  const duration = onlyDuration ? action.supportingText.replace(/\.$/, "") : null;

  return (
    <>
      <ChildHero
        overline={action.kind === "done_today" ? undefined : "Your next mission"}
        title={action.title}
        {...(duration ? { chips: <Chip tone="kaya" size="lg" icon={<Clock />}>{duration}</Chip> } : { supportingText: action.supportingText })}
        illustration={<ChildIllustration kind={action.kind} />}
        ctaLabel={action.ctaLabel}
        href={action.href}
        {...(action.kind === "start_practice" ? { action: startRecommendedAction } : {})}
      />
      {countdownLine ? (
        <p className={childPillClassName}>
          <CalendarDays aria-hidden="true" className="h-5 w-5 shrink-0 text-kaki-strong" strokeWidth={2.25} />
          {countdownLine}
        </p>
      ) : null}
      {glance?.justEarned ? (
        <p data-just-earned className="flex items-start gap-3 rounded-3xl border border-kaya/40 bg-kaya-soft px-5 py-3 text-xl text-ink">
          <Sparkles aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-kaya-strong" strokeWidth={2.25} />
          {glance.justEarned}
        </p>
      ) : null}
      {glance && (glance.balance > 0 || glance.nearest) ? (
        <Link
          href="/rewards"
          data-points-glance
          className="flex min-h-20 items-center gap-4 rounded-3xl border border-child-line bg-child-card p-4 text-lg text-ink shadow-child transition-colors hover:border-kaya focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-kaki"
        >
          <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-kaya-soft text-kaya-strong">
            <Gift className="h-7 w-7" strokeWidth={2.25} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xl">
              <span className="text-2xl font-extrabold text-kaya-strong">{glance.balance}</span> Learning {glance.balance === 1 ? "Point" : "Points"}
            </span>
            {glance.nearest ? (
              <span className="text-base text-ink-soft">
                <span aria-hidden="true">{glance.nearest.symbol} </span>
                {glance.nearest.title}: {glance.nearest.text}
              </span>
            ) : null}
          </span>
        </Link>
      ) : null}
    </>
  );
}
