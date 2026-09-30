import type { Metadata } from "next";
import { getParentPracticeSuggestion } from "@/application/queries/progress";
import { requireParent } from "@/application/queries/current-parent";
import { CheckCircleBurst, Sprout } from "@/components/illustrations";
import { ActionCard } from "@/components/ui/action-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { suggestPracticeAction } from "./actions";

export const metadata: Metadata = { title: "Practice · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * Practice is done by the child, on their own device, so the parent's part is to suggest it: one button that
 * puts the topic at the top of their Today. Suggesting again changes nothing, and there is one way back.
 */
export default async function ParentPracticePage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const parent = await requireParent();
  const { topic } = await searchParams;
  const suggestion = await getParentPracticeSuggestion(parent.parentProfileId, topic);

  if (!suggestion) {
    return (
      <>
        <PageHeader title="Practice" />
        <EmptyState
          title="Nothing to suggest yet"
          illustration={<Sprout className="h-28 w-auto sm:h-32" />}
          action={
            <ButtonLink href="/progress" variant="secondary">
              Back to Progress
            </ButtonLink>
          }
        >
          After a mock or some practice, we can suggest the topic that will help most.
        </EmptyState>
      </>
    );
  }

  const { childNickname, topicLabel } = suggestion;
  return (
    <>
      <PageHeader title="Practice" description={`${topicLabel} practice is done by ${childNickname}, on their own device, in about 15 minutes.`} />
      {suggestion.alreadySuggested ? (
        <ActionCard illustration={<CheckCircleBurst className="h-24 w-auto md:h-32" />}>
          <h2 data-suggested className="text-2xl font-bold leading-tight tracking-tight text-ink">Suggested to {childNickname}</h2>
          <p className="text-lg text-ink-soft">{topicLabel} practice is now the first thing on {childNickname}&apos;s Today screen.</p>
          <ButtonLink href="/progress" variant="primary" size="lg" className="mt-1 w-full sm:w-auto">
            Back to Progress
          </ButtonLink>
        </ActionCard>
      ) : (
        <ActionCard illustration={<Sprout className="h-24 w-auto md:h-32" />}>
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-ink">{topicLabel}</h2>
          <p className="text-lg text-ink-soft">
            {childNickname} will see it as their next mission, with a Start button. Nothing else to set up.
          </p>
          <form action={suggestPracticeAction.bind(null, suggestion.childId, suggestion.topicId)} className="mt-1 w-full sm:w-auto">
            <SubmitButton variant="primary" size="lg" className="w-full sm:w-auto">
              Suggest to {childNickname}
            </SubmitButton>
          </form>
        </ActionCard>
      )}
      {suggestion.alreadySuggested ? null : (
        <div>
          <ButtonLink href="/progress" variant="quiet" flush>
            Back to Progress
          </ButtonLink>
        </div>
      )}
    </>
  );
}
