import { CalendarDays, Check, ChevronDown, CircleDashed, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getPrepareOverview, type AssessmentCard } from "@/application/queries/assessment-setup";
import { getParentChildren } from "@/application/queries/children";
import { requireParent } from "@/application/queries/current-parent";
import { PaperStack } from "@/components/illustrations";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Prepare · PaperKaki" };

function AssessmentCardView({ card, primary }: { card: AssessmentCard; primary: boolean }) {
  return (
    <Card className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={card.past ? "neutral" : "kaya"} icon={<CalendarDays />} data-numeric>
            {card.countdown}
          </Chip>
          <Chip tone={card.scopeConfirmed ? "teal" : "neutral"} icon={card.scopeConfirmed ? <Check /> : <CircleDashed />}>
            {card.stateText}
          </Chip>
        </div>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-xl font-bold tracking-tight text-ink">{card.name}</h3>
          <p className="text-lg text-ink-soft">{card.dateText}</p>
        </div>
      </div>
      <ButtonLink href={card.actionHref} variant={primary ? "primary" : card.past ? "quiet" : "secondary"} className="w-full sm:w-auto sm:shrink-0">
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
        <EmptyState
          title="No assessments yet"
          illustration={<PaperStack className="h-28 w-auto sm:h-32" />}
          action={<ButtonLink href="/prepare/new">Add upcoming assessment</ButtonLink>}
        >
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
            <ButtonLink href="/prepare/new" variant="quiet" flush>
              <Plus aria-hidden="true" className="h-5 w-5" />
              Add upcoming assessment
            </ButtonLink>
          </div>
        </>
      )}
      {overview.past.length > 0 ? (
        <details className="group/details rounded-card border border-line bg-surface p-5 shadow-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">
            Past assessments
            <span aria-hidden="true" className="text-ink-soft transition-transform group-open/details:rotate-180">
              <ChevronDown className="h-5 w-5" strokeWidth={2.5} />
            </span>
          </summary>
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
