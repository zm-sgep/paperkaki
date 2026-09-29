import type { Metadata } from "next";
import { requireParent } from "@/application/queries/current-parent";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Add an assessment · PaperKaki" };

/** Placeholder: the assessment form replaces this page in the next slice. */
export default async function NewAssessmentPage() {
  await requireParent();
  return (
    <>
      <PageHeader title="What is your child preparing for?" />
      <Card>
        <p className="text-lg text-ink-soft">This form is coming next. Nothing to fill in yet.</p>
      </Card>
    </>
  );
}
