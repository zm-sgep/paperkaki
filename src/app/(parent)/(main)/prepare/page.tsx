import type { Metadata } from "next";
import { getPrepareOverview, type AssessmentCard } from "@/application/queries/assessment-setup";
import { getParentChildren } from "@/application/queries/children";
import { requireParent } from "@/application/queries/current-parent";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Prepare · PaperKaki" };

function AssessmentCardView({ card, primary }: { card: AssessmentCard; primary: boolean }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold text-ink">{card.name}</h3>
        <p className="text-lg text-ink-soft">
          {card.dateText} · {card.countdown}
        </p>
        <p className="text-lg font-medium text-ink">{card.stateText}</p>
      </div>
      <ButtonLink href={card.actionHref} variant={primary ? "primary" : card.past ? "quiet" : "secondary"} className="w-full sm:w-auto sm:self-start">
        {card.actionLabel}
      </ButtonLink>
    </Card>
  );
}

export default async function PreparePage() {
  const parent = await requireParent();
  const { selectedChildId } = await getParentChildren(parent.parentProfileId);
  const overview = selectedChildId
    ? await getPrepareOverview(parent.parentProfileId, selectedChildId)
    : { upcoming: [], past: [] };
  const hasAny = overview.upcoming.length + overview.past.length > 0;

  return (
    <>
      <PageHeader title="Prepare" />
      {overview.upcoming.length === 0 ? (
        <EmptyState title="No assessments yet" action={<ButtonLink href="/prepare/new">Add upcoming assessment</ButtonLink>}>
          {hasAny ? "Nothing coming up. Add the next assessment when you know the date." : "Upcoming assessments you add will appear here."}
        </EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {overview.upcoming.map((card, index) => (
              <li key={card.id}>
                <AssessmentCardView card={card} primary={index === 0} />
              </li>
            ))}
          </ul>
          <div>
            <ButtonLink href="/prepare/new" variant="quiet">
              Add upcoming assessment
            </ButtonLink>
          </div>
        </>
      )}
      {overview.past.length > 0 ? (
        <details className="rounded-2xl border border-line bg-surface p-5">
          <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold text-ink">Past assessments</summary>
          <ul className="mt-3 flex flex-col gap-4">
            {overview.past.map((card) => (
              <li key={card.id}>
                <AssessmentCardView card={card} primary={false} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
