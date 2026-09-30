import type { Metadata } from "next";
import { requireChild } from "@/application/queries/current-child";
import { getChildRewards } from "@/application/queries/rewards";
import { ChildCard } from "@/components/child/child-card";
import { SubmitButton } from "@/components/ui/submit-button";
import { AskButton } from "./ask-button";
import { takeBackRequestAction } from "./actions";

export const metadata: Metadata = { title: "Rewards · PaperKaki" };
export const dynamic = "force-dynamic";

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
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Rewards</h1>

      <ChildCard className="flex flex-col gap-1">
        <p className="text-lg text-ink-soft">You have</p>
        <p data-balance className="text-5xl font-bold tracking-tight text-kaki-strong">
          {view.balance}
          <span className="ml-3 text-2xl font-semibold text-ink">Learning {view.balance === 1 ? "Point" : "Points"}</span>
        </p>
        <p className="text-lg text-ink-soft">You earn points by learning, fixing mistakes and getting better.</p>
      </ChildCard>

      <section aria-labelledby="rewards-heading" className="flex flex-col gap-3">
        <h2 id="rewards-heading" className="text-2xl font-semibold text-ink">
          Rewards from your grown-up
        </h2>
        {view.rewards.length === 0 ? (
          <ChildCard>
            <p className="text-xl text-ink-soft">Your grown-up hasn&apos;t set up any rewards yet. Keep learning, and check back soon.</p>
          </ChildCard>
        ) : (
          <ul data-rewards className="flex flex-col gap-4">
            {view.rewards.map((reward) => (
              <li key={reward.id} data-reward-card className="flex flex-col gap-3 rounded-3xl border-2 border-child-line bg-child-card p-5">
                <div className="flex items-start gap-4">
                  <span aria-hidden="true" className="text-4xl">
                    {reward.symbol}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="text-xl font-semibold text-ink">{reward.title}</h3>
                    {reward.description ? <p className="text-lg text-ink-soft">{reward.description}</p> : null}
                    <p className="text-lg text-ink-soft">
                      {reward.cost} {reward.cost === 1 ? "point" : "points"}
                    </p>
                  </div>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Points towards ${reward.title}`}
                  aria-valuemin={0}
                  aria-valuemax={reward.cost}
                  aria-valuenow={Math.min(view.balance, reward.cost)}
                  className="h-3 overflow-hidden rounded-full bg-child-line"
                >
                  <div className="h-3 rounded-full bg-kaki" style={{ width: `${Math.round(reward.progress * 100)}%` }} />
                </div>
                {reward.state === "ready" ? (
                  <AskButton rewardId={reward.id} title={reward.title} firstAsk={view.firstAsk} />
                ) : reward.state === "waiting" ? (
                  <p data-reward-state="waiting" className="text-lg font-semibold text-kaki-strong">
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
          <h2 id="requests-heading" className="text-2xl font-semibold text-ink">
            What you asked for
          </h2>
          <ul data-requests className="flex flex-col rounded-3xl border-2 border-child-line bg-child-card px-5">
            {view.requests.map((request) => (
              <li key={request.id} data-request-status={request.status} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-child-line py-3 last:border-b-0">
                <div className="flex min-w-0 flex-col">
                  <span className="text-xl font-semibold text-ink">
                    <span aria-hidden="true">{request.symbol} </span>
                    {request.title}
                  </span>
                  <span className="text-lg text-ink-soft">
                    {request.statusText} · {request.dayText}
                  </span>
                </div>
                {request.canTakeBack ? (
                  <form action={takeBackRequestAction.bind(null, request.id)}>
                    <SubmitButton variant="quiet" className="min-h-14 rounded-2xl px-4 text-lg">
                      Take it back
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.recent.length > 0 ? (
        <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
          <h2 id="recent-heading" className="text-2xl font-semibold text-ink">
            Recent points
          </h2>
          <ul data-recent-points className="flex flex-col rounded-3xl border-2 border-child-line bg-child-card px-5">
            {view.recent.map((entry, index) => (
              <li key={index} className="flex items-baseline justify-between gap-4 border-b-2 border-child-line py-3 text-lg last:border-b-0">
                <span className="min-w-0 text-ink">{entry.label}</span>
                <span className="shrink-0 font-semibold text-kaki-strong">{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
