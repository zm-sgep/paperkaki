import { ChevronDown, Gift, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { getParentRewards, type ParentRewardRow2 } from "@/application/queries/rewards";
import { requireParent } from "@/application/queries/current-parent";
import { GiftBox } from "@/components/illustrations";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { restoreRewardAction, retireRewardAction } from "./actions";
import { FulfilButton, RequestActions } from "./request-actions";
import { BonusForm, RewardForm } from "./reward-form";

export const metadata: Metadata = { title: "Rewards · PaperKaki" };
export const dynamic = "force-dynamic";

/** A folded-away form or list: a summary that opens it, with a turning chevron. Inherits the page's card look. */
const sectionSummary =
  "flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold text-kaki-strong [&::-webkit-details-marker]:hidden";
const disclosureCard = "group/details rounded-card border border-line bg-surface px-5 shadow-card";
const pointsText = (points: number) => `${points} ${points === 1 ? "point" : "points"}`;

function Chevron() {
  return <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft transition-transform group-open/details:rotate-180" strokeWidth={2.5} />;
}

/** The reward's picture (the parent chose an emoji for it) on a soft tile. */
function RewardSymbol({ symbol, size = "md" }: { symbol: string; size?: "md" | "lg" }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-2xl bg-kaya-soft ${size === "lg" ? "h-14 w-14 text-3xl" : "h-12 w-12 text-2xl"}`}>
      {symbol}
    </span>
  );
}

/** One reward in the catalogue, as a card: its picture, name, cost and who it is for, with Edit and Retire under it. */
function RewardRow({ reward, childOptions }: { reward: ParentRewardRow2; childOptions: { id: string; nickname: string }[] }) {
  return (
    <li data-reward-row className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card has-[details[open]]:md:col-span-2">
      <div className="flex items-start gap-4">
        <RewardSymbol symbol={reward.symbol} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="text-lg font-bold leading-snug text-ink">{reward.title}</span>
          <Chip tone="kaya" icon={<Sparkles />}>
            {pointsText(reward.cost)}
          </Chip>
        </div>
      </div>
      <p className="text-base text-ink-soft">
        For {reward.forText}
        {reward.notes ? ` · ${reward.notes}` : ""}
      </p>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 border-t border-line pt-2">
        <details className="group/details w-full">
          <summary className={sectionSummary}>
            <span>
              Edit<span className="sr-only">: {reward.title}</span>
            </span>
            <Chevron />
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
          <SubmitButton variant="quiet" flush>
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
        <EmptyState title="No rewards yet" illustration={<GiftBox className="h-28 w-auto sm:h-32" />}>
          Learning Points and rewards you set up will appear here.
        </EmptyState>
      </>
    );
  }

  const { child } = view;
  return (
    <>
      <PageHeader title="Rewards" description={`${child.nickname} has ${pointsText(view.balance)}`} />

      {view.pending.length > 0 ? (
        <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
          <h2 id="pending-heading" className="text-xl font-bold tracking-tight text-ink">
            Waiting for your answer
          </h2>
          <ul data-pending className="flex flex-col gap-3">
            {view.pending.map((request) => (
              <li
                key={request.id}
                data-request
                className="flex flex-col gap-4 rounded-hero border-2 border-kaya/60 bg-linear-to-br from-kaya-soft from-60% to-white p-5 shadow-hero sm:p-6"
              >
                <div className="flex items-start gap-4">
                  <RewardSymbol symbol={request.symbol} size="lg" />
                  <p className="text-lg text-ink">
                    <span className="font-semibold">{request.childNickname}</span> would like{" "}
                    <span className="font-semibold">{request.title}</span>{" "}
                    for {pointsText(request.cost)}.
                  </p>
                </div>
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
          <h2 id="awaiting-heading" className="text-xl font-bold tracking-tight text-ink">
            Approved, ready to give
          </h2>
          <ul data-awaiting className="flex flex-col gap-3">
            {view.awaiting.map((request) => (
              <li key={request.id} className="flex flex-col gap-4 rounded-card border border-kaki/30 bg-kaki-soft p-5 shadow-card">
                <div className="flex items-center gap-4">
                  <RewardSymbol symbol={request.symbol} />
                  <p className="text-lg text-ink">
                    <span className="font-semibold">{request.title}</span> for {request.childNickname}
                  </p>
                </div>
                <FulfilButton redemptionId={request.id} title={request.title} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight text-ink">{child.nickname}&apos;s points this week</h2>
        <dl data-week className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 rounded-xl bg-kaki-soft p-4">
            <dt className="text-base text-ink-soft">Earned by learning</dt>
            <dd data-week-learning data-numeric className="text-4xl font-extrabold leading-none tracking-tight text-kaki-strong">
              {view.week.learning}
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-kaya-soft p-4">
            <dt className="text-base text-ink-soft">Bonus from you</dt>
            <dd data-week-bonus data-numeric className="text-4xl font-extrabold leading-none tracking-tight text-kaya-strong">
              {view.week.bonus}
            </dd>
          </div>
        </dl>
        {view.week.topReasons.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-base text-ink-soft">What earned the most</p>
            <ul data-top-reasons className="flex flex-col text-lg text-ink">
              {view.week.topReasons.map((reason) => (
                <li key={reason.label} className="flex min-h-12 items-center justify-between gap-3 border-b border-line last:border-b-0">
                  <span>{reason.label}</span>
                  <span data-numeric className="font-bold text-kaki-strong">+{reason.points}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-lg text-ink-soft">Nothing earned yet this week. Points arrive after practice, fixing mistakes and mocks.</p>
        )}
      </Card>

      <section aria-labelledby="catalogue-heading" className="flex flex-col gap-3">
        <h2 id="catalogue-heading" className="text-xl font-bold tracking-tight text-ink">
          Your rewards
        </h2>
        {view.rewards.length === 0 ? (
          <p className="text-lg text-ink-soft">
            You decide what {child.nickname} can work towards, from a treat to a trip. Add the first one below.
          </p>
        ) : (
          <ul data-rewards className="grid gap-4 md:grid-cols-2">
            {view.rewards.map((reward) => (
              <RewardRow key={reward.id} reward={reward} childOptions={view.children} />
            ))}
          </ul>
        )}
        <details data-add-reward open={view.rewards.length === 0 ? true : undefined} className={disclosureCard}>
          <summary className={sectionSummary}>
            Add a reward
            <Chevron />
          </summary>
          <div className="pb-4">
            <RewardForm mode="create" childOptions={view.children} idPrefix="new-reward" />
          </div>
        </details>
        {view.retired.length > 0 ? (
          <details className={disclosureCard}>
            <summary className={sectionSummary}>
              Retired rewards ({view.retired.length})
              <Chevron />
            </summary>
            <ul className="grid gap-4 pb-5 pt-2 md:grid-cols-2">
              {view.retired.map((reward) => (
                <RewardRow key={reward.id} reward={reward} childOptions={view.children} />
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <details data-bonus className={disclosureCard}>
        <summary className={sectionSummary}>
          <span className="flex items-center gap-2.5">
            <Gift aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />
            Give bonus points
          </span>
          <Chevron />
        </summary>
        <div className="pb-4">
          <BonusForm childId={child.id} childNickname={child.nickname} submissionId={randomUUID()} />
        </div>
      </details>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-xl font-bold tracking-tight text-ink">
          History
        </h2>
        {view.history.length === 0 ? (
          <p className="text-lg text-ink-soft">Points and rewards will be listed here.</p>
        ) : (
          <ul data-history className="flex flex-col rounded-card border border-line bg-surface px-5 shadow-card">
            {view.history.map((entry) => (
              <li key={entry.id} data-history-kind={entry.kind} className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-b-0">
                <span className="flex min-w-0 flex-col">
                  <span className="text-lg text-ink">{entry.label}</span>
                  <span className="text-base text-ink-soft">
                    {entry.kind === "learning" ? "Learning" : entry.kind === "bonus" ? "Bonus from you" : entry.kind === "reward" ? "Reward" : "Correction"} · {entry.dayText}
                  </span>
                </span>
                <span
                  data-numeric
                  className={`shrink-0 rounded-full px-3 py-0.5 text-lg font-extrabold ${entry.amount > 0 ? "bg-kaki-soft text-kaki-strong" : "bg-paper text-ink"}`}
                >
                  {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
