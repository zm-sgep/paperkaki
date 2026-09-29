import type { Metadata } from "next";
import { getParentChildren } from "@/application/queries/children";
import { requireParent } from "@/application/queries/current-parent";
import { todayInSingapore } from "@/application/queries/parent-home";
import { ASSESSMENT_TYPES, ASSESSMENT_TYPE_LABEL } from "@/domain/assessments";
import { PageHeader } from "@/components/ui/page-header";
import { NewAssessmentForm } from "./new-assessment-form";

export const metadata: Metadata = { title: "Add an assessment · PaperKaki" };

/** Screen A: what is your child preparing for? Manual entry; upload arrives later (ADR-0011). */
export default async function NewAssessmentPage() {
  const parent = await requireParent();
  const { children, selectedChildId } = await getParentChildren(parent.parentProfileId);
  return (
    <>
      <PageHeader title="What is your child preparing for?" />
      <NewAssessmentForm
        kids={children}
        selectedChildId={selectedChildId}
        types={ASSESSMENT_TYPES.map((value) => ({ value, label: ASSESSMENT_TYPE_LABEL[value] }))}
        today={todayInSingapore()}
      />
    </>
  );
}
