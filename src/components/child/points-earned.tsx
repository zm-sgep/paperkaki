import type { ActivityReward } from "@/application/rewards";

/**
 * What an activity earned, in a calm card: "+14 Learning Points · You improved in Fractions and reviewed two
 * mistakes." When yield was low the encouraging redirect follows instead of any talk of loss. Shown only after
 * meaningful learning, never inside Mock Mode or before a mock.
 */
export function PointsEarned({ reward }: { reward: ActivityReward | null }) {
  if (!reward || (!reward.line && !reward.redirect)) return null;
  const [headline, ...rest] = (reward.line ?? "").split(" · ");
  return (
    <div data-points className="flex w-full flex-col gap-2 rounded-2xl border-2 border-kaki/30 bg-child-card p-4">
      {reward.line ? (
        <p data-points-earned className="text-xl text-ink">
          <span className="text-2xl font-bold text-kaki-strong">{headline}</span>
          {rest.length > 0 ? <span> · {rest.join(" · ")}</span> : null}
        </p>
      ) : null}
      {reward.redirect ? (
        <p data-points-redirect className="text-xl text-ink-soft">
          {reward.redirect}
        </p>
      ) : null}
    </div>
  );
}
