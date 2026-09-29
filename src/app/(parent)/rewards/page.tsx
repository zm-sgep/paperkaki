import type { Metadata } from "next";
import { requireParent } from "@/application/queries/current-parent";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Rewards · PaperKaki" };

export default async function RewardsPage() {
  await requireParent();
  return (
    <>
      <PageHeader title="Rewards" />
      <EmptyState title="No rewards yet">
        Learning Points and rewards you set up will appear here.
      </EmptyState>
    </>
  );
}
