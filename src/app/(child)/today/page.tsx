import type { Metadata } from "next";
import { getChildToday } from "@/application/queries/child-today";
import { requireChild } from "@/application/queries/current-child";
import { ChildHero } from "@/components/child/child-card";
import { startRecommendedAction } from "../practice/actions";

export const metadata: Metadata = { title: "Today · PaperKaki" };
export const dynamic = "force-dynamic";

/** Today is one mission with one button, and at most one quiet line of context. Never a menu. */
export default async function TodayPage() {
  const child = await requireChild();
  const { action, countdownLine } = await getChildToday(child);
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
    </>
  );
}
