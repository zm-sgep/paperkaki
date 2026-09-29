import type { Metadata } from "next";
import { requireParent } from "@/application/queries/current-parent";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Progress · PaperKaki" };

export default async function ProgressPage() {
  await requireParent();
  return (
    <>
      <PageHeader title="Progress" />
      <EmptyState title="Nothing to show yet">
        After your child&apos;s first mock, you&apos;ll see what is improving and what needs work.
      </EmptyState>
    </>
  );
}
