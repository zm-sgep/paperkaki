import type { Metadata } from "next";
import { requireParent } from "@/application/queries/current-parent";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Prepare · PaperKaki" };

export default async function PreparePage() {
  await requireParent();
  return (
    <>
      <PageHeader title="Prepare" />
      <EmptyState
        title="No assessments yet"
        action={<ButtonLink href="/prepare/new">Add upcoming assessment</ButtonLink>}
      >
        Upcoming assessments you add will appear here.
      </EmptyState>
    </>
  );
}
