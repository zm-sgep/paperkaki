import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScopeSetup } from "@/application/queries/assessment-setup";
import { requireParent } from "@/application/queries/current-parent";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { ScopeForm } from "./scope-form";

export const metadata: Metadata = { title: "Choose topics · PaperKaki" };

/** Screen B: which topics are in the assessment? The school's notice is the source of truth. */
export default async function ScopePage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const parent = await requireParent();
  const { assessmentId } = await params;
  const setup = await getScopeSetup(parent.parentProfileId, assessmentId);
  if (!setup) notFound();
  return (
    <>
      <p className="-mb-3 text-base font-medium text-ink-soft">{setup.assessment.contextLine}</p>
      <PageHeader title={`Which topics are in ${setup.assessment.name}?`} />
      <Notice>
        <p>Check the school&apos;s notice and tick the topics it lists.</p>
      </Notice>
      <ScopeForm assessmentId={assessmentId} topics={setup.topics} />
    </>
  );
}
