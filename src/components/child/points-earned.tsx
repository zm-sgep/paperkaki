import { Sparkles } from "lucide-react";
import type { ActivityReward } from "@/application/rewards";

/**
 * What an activity earned, in a calm card: a small kaya pill "+14 Learning Points" and the reason, "You improved
 * in Fractions and reviewed two mistakes." When yield was low the encouraging redirect follows instead of any talk
 * of loss. Shown only after meaningful learning, never inside Mock Mode or before a mock.
 */
export function PointsEarned({ reward }: { reward: ActivityReward | null }) {
  if (!reward || (!reward.line && !reward.redirect)) return null;
  const [headline, ...rest] = (reward.line ?? "").split(" · ");
  return (
    <div data-points className="flex w-full flex-col gap-3 rounded-3xl border border-kaya/40 bg-kaya-soft p-4 sm:p-5">
      {reward.line ? (
        <p data-points-earned className="flex flex-col items-start gap-2 text-xl leading-relaxed text-ink">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-kaya/50 bg-child-card px-3.5 py-1 text-lg font-extrabold text-kaya-strong">
            <Sparkles aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            {headline}
          </span>
          {rest.length > 0 ? (
            <>
              {/* The separator stays in the text for assistive technology; the layout puts the reason on its own line. */}
              <span className="sr-only"> · </span>
              <span>{rest.join(" · ")}</span>
            </>
          ) : null}
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
