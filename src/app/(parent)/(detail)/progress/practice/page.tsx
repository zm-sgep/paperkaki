import type { Metadata } from "next";
import { requireParent } from "@/application/queries/current-parent";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Practice · PaperKaki" };

/** A placeholder until practice sets arrive: honest about it, with one way back. */
export default async function ParentPracticePage() {
  await requireParent();
  return (
    <>
      <PageHeader title="Practice" />
      <EmptyState
        title="Practice sets are on their way"
        action={
          <ButtonLink href="/progress" variant="secondary">
            Back to Progress
          </ButtonLink>
        }
      >
        Short practice sets for the topics that need work will appear here soon. For now, the marked paper shows the questions worth going through together.
      </EmptyState>
    </>
  );
}
