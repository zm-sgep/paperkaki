import { CalendarDays, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getParentHome } from "@/application/queries/parent-home";
import { requireParent } from "@/application/queries/current-parent";
import { HomeIllustration } from "@/components/parent/HomeIllustration";
import { Chip } from "@/components/ui/chip";
import { HeroAction } from "@/components/ui/hero-action";

export const metadata: Metadata = { title: "Home · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * Home is a decision surface: one hero with one primary button, and at most one line of context. A reward
 * request waiting for an answer is only a quiet line under the hero, so it never replaces the learning next
 * step. When nothing else is due it becomes the hero.
 */
export default async function HomePage() {
  const parent = await requireParent();
  const { action, context, contextLine, rewardRequest } = await getParentHome(parent.parentProfileId);
  const nothingElseDue = action.kind === "done_today";
  const request = rewardRequest;

  if (request && nothingElseDue) {
    return (
      <>
        <HeroAction
          title={`${request.childNickname} would like ${request.title}`}
          supportingText={request.count > 1 ? `${request.count} requests are waiting for your answer.` : "Take a look and say yes or no."}
          ctaLabel="Answer request"
          href="/rewards"
          illustration={<HomeIllustration kind="reward_request" />}
        />
        {contextLine ? <p className="text-lg text-ink-soft">{contextLine}</p> : null}
      </>
    );
  }
  return (
    <>
      <HeroAction
        title={action.title}
        supportingText={action.supportingText}
        ctaLabel={action.ctaLabel}
        href={action.href}
        illustration={<HomeIllustration kind={action.kind} />}
        eyebrow={
          context ? (
            <>
              <Chip tone="teal" icon={<UserRound />}>
                {context.childNickname} · {context.assessmentName}
              </Chip>
              <Chip tone="kaya" icon={<CalendarDays />} data-numeric>
                {context.countdown}
              </Chip>
            </>
          ) : null
        }
      />
      {contextLine ? <p className="text-lg text-ink-soft">{contextLine}</p> : null}
      {request ? (
        <p data-reward-request className="text-lg text-ink-soft">
          {request.childNickname} asked for {request.title}.{" "}
          <Link href="/rewards" className="inline-flex min-h-12 items-center font-semibold text-kaki-strong underline underline-offset-4">
            Answer request
          </Link>
        </p>
      ) : null}
    </>
  );
}
