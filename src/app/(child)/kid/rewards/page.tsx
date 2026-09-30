import { Check, Clock, Gift, Hourglass, Sparkles, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import { requireChild } from "@/application/queries/current-child";
import { getChildRewards } from "@/application/queries/rewards";
import { ChildCard, ChildSectionTitle, ChildTitle } from "@/components/child/child-card";
import { GiftBox } from "@/components/illustrations";
import { ButtonLink } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { SubmitButton } from "@/components/ui/submit-button";
import { AskButton } from "./ask-button";
import { takeBackRequestAction } from "./actions";

export const metadata: Metadata = { title: "Rewards · PaperKaki" };
export const dynamic = "force-dynamic";

const pointsWord = (points: number) => (points === 1 ? "point" : "points");

/** A request's state as a chip: the words say it; the tint and icon only support them. */
const REQUEST_CHIP: Record<string, { tone: ChipTone; icon: typeof Check }> = {
  requested: { tone: "kaya", icon: Hourglass },
  approved: { tone: "teal", icon: Check },
  fulfilled: { tone: "teal", icon: Gift },
  rejected: { tone: "neutral", icon: Clock },
  cancelled: { tone: "neutral", icon: Undo2 },
};

/**
 * Served at /rewards for a child device (see proxy.ts). The points they have, the rewards their grown-up has
 * set up with how close each is, one way to ask, and what happened to what they asked. Nothing is random,
 * nothing is lost by not visiting, and nothing counts down.
 */
export default async function ChildRewardsPage() {
  const child = await requireChild();
  const view = await getChildRewards(child);
  return (
    <div className="flex flex-col gap-6">
      <ChildTitle>Rewards</ChildTitle>

      <section className="relative overflow-hidden rounded-hero border border-kaya/40 bg-linear-to-br from-kaya-soft from-55% to-child-card p-6 shadow-child sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-lg font-semibold text-ink-soft">You have</p>
            <p data-balance className="flex flex-wrap items-baseline gap-x-3 text-ink">
              <span data-numeric className="text-6xl font-extrabold leading-none tracking-tight text-kaya-strong sm:text-7xl">
                {view.balance}
              </span>
              <span className="text-2xl font-bold">Learning {view.balance === 1 ? "Point" : "Points"}</span>
            </p>
            <p className="pt-2 text-lg text-ink-soft">You earn points by learning, fixing mistakes and getting better.</p>
          </div>
          <div aria-hidden="true" className="shrink-0">
            <GiftBox className="h-20 w-auto sm:h-28 md:h-36" />
          </div>
        </div>
      </section>

      <section aria-labelledby="rewards-heading" className="flex flex-col gap-3">
        <ChildSectionTitle id="rewards-heading">Rewards from your grown-up</ChildSectionTitle>
        {view.rewards.length === 0 ? (
          <ChildCard className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
            <div aria-hidden="true" className="flex w-full shrink-0 justify-center sm:w-auto">
              <GiftBox className="h-28 w-auto sm:h-32" />
            </div>
            <div className="flex min-w-0 flex-col items-start gap-4">
              <p className="text-xl text-ink-soft">Your grown-up hasn&apos;t set up any rewards yet. Keep learning, and check back soon.</p>
              <ButtonLink href="/today" variant="secondary" size="lg" shape="pill">
                Back to Today
              </ButtonLink>
            </div>
          </ChildCard>
        ) : (
          <ul data-rewards className="grid gap-4 md:grid-cols-2">
            {view.rewards.map((reward) => (
              <li key={reward.id} data-reward-card className="flex flex-col gap-4 rounded-3xl border border-child-line bg-child-card p-5 shadow-child">
                <div className="flex items-start gap-4">
                  <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-kaya-soft text-4xl">
                    {reward.symbol}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <h3 className="text-xl font-extrabold leading-snug text-ink">{reward.title}</h3>
                    {reward.description ? <p className="text-lg text-ink-soft">{reward.description}</p> : null}
                    <Chip tone="kaya" size="lg" icon={<Sparkles />} className="mt-1">
                      {reward.cost} {pointsWord(reward.cost)}
                    </Chip>
                  </div>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Points towards ${reward.title}`}
                  aria-valuemin={0}
                  aria-valuemax={reward.cost}
                  aria-valuenow={Math.min(view.balance, reward.cost)}
                  className="h-3.5 overflow-hidden rounded-full bg-child-line"
                >
                  <div className="h-full rounded-full bg-kaki" style={{ width: `${Math.round(reward.progress * 100)}%` }} />
                </div>
                {reward.state === "ready" ? (
                  <AskButton rewardId={reward.id} title={reward.title} firstAsk={view.firstAsk} />
                ) : reward.state === "waiting" ? (
                  <p data-reward-state="waiting" className="flex items-center gap-2 text-lg font-bold text-kaki-strong">
                    <Hourglass aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                    Asked. Waiting for your grown-up.
                  </p>
                ) : reward.state === "limit" ? (
                  <p data-reward-state="limit" className="text-lg text-ink-soft">
                    You&apos;ve asked for this one already this week. You can ask again next week.
                  </p>
                ) : (
                  <p data-reward-state="more" className="text-lg text-ink-soft">
                    {reward.moreText}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.requests.length > 0 ? (
        <section aria-labelledby="requests-heading" className="flex flex-col gap-3">
          <ChildSectionTitle id="requests-heading">What you asked for</ChildSectionTitle>
          <ul data-requests className="flex flex-col gap-3">
            {view.requests.map((request) => {
              const chip = REQUEST_CHIP[request.status] ?? { tone: "neutral" as const, icon: Clock };
              const ChipIcon = chip.icon;
              return (
                <li
                  key={request.id}
                  data-request-status={request.status}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3xl border border-child-line bg-child-card p-4 shadow-child"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-kaya-soft text-3xl">
                      {request.symbol}
                    </span>
                    <div className="flex min-w-0 flex-col items-start gap-1.5">
                      <span className="text-xl font-bold leading-snug text-ink">{request.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink-soft">
                        <Chip tone={chip.tone} size="lg" icon={<ChipIcon />}>
                          {request.statusText}
                        </Chip>
                        <span aria-hidden="true">·</span>
                        <span>{request.dayText}</span>
                      </span>
                    </div>
                  </div>
                  {request.canTakeBack ? (
                    <form action={takeBackRequestAction.bind(null, request.id)}>
                      <SubmitButton variant="quiet" size="lg" shape="pill">
                        Take it back
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {view.recent.length > 0 ? (
        <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
          <ChildSectionTitle id="recent-heading">Recent points</ChildSectionTitle>
          <ul data-recent-points className="flex flex-col rounded-3xl border border-child-line bg-child-card px-5 shadow-child">
            {view.recent.map((entry, index) => (
              <li key={index} className="flex items-center justify-between gap-4 border-b border-child-line py-3.5 text-lg last:border-b-0">
                <span className="min-w-0 text-ink">{entry.label}</span>
                <span data-numeric className="shrink-0 rounded-full bg-kaya-soft px-3 py-0.5 font-extrabold text-kaya-strong">
                  {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
