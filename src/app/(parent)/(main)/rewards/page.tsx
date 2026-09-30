import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { getParentRewards, type ParentRewardRow2 } from "@/application/queries/rewards";
import { requireParent } from "@/application/queries/current-parent";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { restoreRewardAction, retireRewardAction } from "./actions";
import { FulfilButton, RequestActions } from "./request-actions";
import { BonusForm, RewardForm } from "./reward-form";

export const metadata: Metadata = { title: "Rewards · PaperKaki" };
export const dynamic = "force-dynamic";

const sectionSummary = "flex min-h-12 cursor-pointer items-center text-lg font-semibold text-kaki";
const pointsText = (points: number) => `${points} ${points === 1 ? "point" : "points"}`;

function RewardRow({ reward, childOptions }: { reward: ParentRewardRow2; childOptions: { id: string; nickname: string }[] }) {
  return (
    <li data-reward-row className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-lg font-semibold text-ink">
          <span aria-hidden="true">{reward.symbol} </span>
          {reward.title}
        </span>
        <span className="text-lg text-ink">{pointsText(reward.cost)}</span>
      </div>
      <p className="text-base text-ink-soft">
        For {reward.forText}
        {reward.notes ? ` · ${reward.notes}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <details className="w-full">
          <summary className={sectionSummary}>
            Edit<span className="sr-only">: {reward.title}</span>
          </summary>
          <div className="pb-2 pt-1">
            <RewardForm
              mode="edit"
              rewardId={reward.id}
              childOptions={childOptions}
              idPrefix={`edit-${reward.id}`}
              defaults={{
                title: reward.title,
                description: reward.description,
                cost: reward.cost,
                icon: reward.icon,
                childId: reward.childId,
                weeklyLimit: reward.weeklyLimit,
                availableFrom: reward.availableFrom,
                availableUntil: reward.availableUntil,
              }}
            />
          </div>
        </details>
        <form action={(reward.active ? retireRewardAction : restoreRewardAction).bind(null, reward.id)}>
          <SubmitButton variant="quiet">
            {reward.active ? "Retire" : "Bring back"}
            <span className="sr-only">: {reward.title}</span>
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

/**
 * The parent's Rewards: who is asking for what first, then the points this week (learning and bonuses kept
 * apart, with what earned them in plain words), the reward list, the two things a parent can add, and history.
 */
export default async function RewardsPage() {
  const parent = await requireParent();
  const view = await getParentRewards(parent.parentProfileId);

  if (view.kind === "no_child") {
    return (
      <>
        <PageHeader title="Rewards" />
        <EmptyState title="No rewards yet">Learning Points and rewards you set up will appear here.</EmptyState>
      </>
    );
  }

  const { child } = view;
  return (
    <>
      <PageHeader title="Rewards" description={`${child.nickname} has ${pointsText(view.balance)}`} />

      {view.pending.length > 0 ? (
        <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
          <h2 id="pending-heading" className="text-xl font-semibold text-ink">
            Waiting for your answer
          </h2>
          <ul data-pending className="flex flex-col gap-3">
            {view.pending.map((request) => (
              <li key={request.id} data-request className="flex flex-col gap-3 rounded-2xl border border-kaki/30 bg-kaki-soft p-5">
                <p className="text-lg text-ink">
                  <span className="font-semibold">{request.childNickname}</span> would like{" "}
                  <span className="font-semibold">
                    <span aria-hidden="true">{request.symbol} </span>
                    {request.title}
                  </span>{" "}
                  for {pointsText(request.cost)}.
                </p>
                {!request.canApprove ? (
                  <p className="text-base text-ink-soft">
                    {request.childNickname} has {pointsText(request.balance)} now, so this can&apos;t be approved yet.
                  </p>
                ) : null}
                <RequestActions redemptionId={request.id} childNickname={request.childNickname} title={request.title} cost={request.cost} canApprove={request.canApprove} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.awaiting.length > 0 ? (
        <section aria-labelledby="awaiting-heading" className="flex flex-col gap-3">
          <h2 id="awaiting-heading" className="text-xl font-semibold text-ink">
            Approved, ready to give
          </h2>
          <ul data-awaiting className="flex flex-col gap-3">
            {view.awaiting.map((request) => (
              <li key={request.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                <p className="text-lg text-ink">
                  <span aria-hidden="true">{request.symbol} </span>
                  <span className="font-semibold">{request.title}</span> for {request.childNickname}
                </p>
                <FulfilButton redemptionId={request.id} title={request.title} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">{child.nickname}&apos;s points this week</h2>
        <dl data-week className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <dt className="text-base text-ink-soft">Earned by learning</dt>
            <dd data-week-learning className="text-3xl font-semibold text-kaki-strong">
              {view.week.learning}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-base text-ink-soft">Bonus from you</dt>
            <dd data-week-bonus className="text-3xl font-semibold text-ink">
              {view.week.bonus}
            </dd>
          </div>
        </dl>
        {view.week.topReasons.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-base text-ink-soft">What earned the most</p>
            <ul data-top-reasons className="flex flex-col text-lg text-ink">
              {view.week.topReasons.map((reason) => (
                <li key={reason.label} className="flex min-h-10 items-center justify-between gap-3">
                  <span>{reason.label}</span>
                  <span className="font-semibold">+{reason.points}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-lg text-ink-soft">Nothing earned yet this week. Points arrive after practice, fixing mistakes and mocks.</p>
        )}
      </Card>

      <section aria-labelledby="catalogue-heading" className="flex flex-col gap-3">
        <h2 id="catalogue-heading" className="text-xl font-semibold text-ink">
          Your rewards
        </h2>
        {view.rewards.length === 0 ? (
          <p className="text-lg text-ink-soft">
            You decide what {child.nickname} can work towards, from a treat to a trip. Add the first one below.
          </p>
        ) : (
          <ul data-rewards className="flex flex-col rounded-2xl border border-line bg-surface px-4">
            {view.rewards.map((reward) => (
              <RewardRow key={reward.id} reward={reward} childOptions={view.children} />
            ))}
          </ul>
        )}
        <details data-add-reward open={view.rewards.length === 0 ? true : undefined} className="rounded-2xl border border-line bg-surface px-4">
          <summary className={sectionSummary}>Add a reward</summary>
          <div className="pb-4">
            <RewardForm mode="create" childOptions={view.children} idPrefix="new-reward" />
          </div>
        </details>
        {view.retired.length > 0 ? (
          <details className="rounded-2xl border border-line bg-surface px-4">
            <summary className={sectionSummary}>Retired rewards ({view.retired.length})</summary>
            <ul className="flex flex-col pb-2">
              {view.retired.map((reward) => (
                <RewardRow key={reward.id} reward={reward} childOptions={view.children} />
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <details data-bonus className="rounded-2xl border border-line bg-surface px-4">
        <summary className={sectionSummary}>Give bonus points</summary>
        <div className="pb-4">
          <BonusForm childId={child.id} childNickname={child.nickname} submissionId={randomUUID()} />
        </div>
      </details>

      <section aria-labelledby="history-heading" className="flex flex-col gap-2">
        <h2 id="history-heading" className="text-xl font-semibold text-ink">
          History
        </h2>
        {view.history.length === 0 ? (
          <p className="text-lg text-ink-soft">Points and rewards will be listed here.</p>
        ) : (
          <ul data-history className="flex flex-col rounded-2xl border border-line bg-surface px-4">
            {view.history.map((entry) => (
              <li key={entry.id} data-history-kind={entry.kind} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
                <span className="flex min-w-0 flex-col">
                  <span className="text-lg text-ink">{entry.label}</span>
                  <span className="text-base text-ink-soft">
                    {entry.kind === "learning" ? "Learning" : entry.kind === "bonus" ? "Bonus from you" : entry.kind === "reward" ? "Reward" : "Correction"} · {entry.dayText}
                  </span>
                </span>
                <span className="shrink-0 text-lg font-semibold text-ink">{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
