import type { Metadata } from "next";
import { getParentChildren } from "@/application/queries/children";
import { requireParent } from "@/application/queries/current-parent";
import { todayInSingapore } from "@/application/queries/parent-home";
import { ASSESSMENT_TYPES, ASSESSMENT_TYPE_LABEL } from "@/domain/assessments";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { isNoticeUploadAvailable } from "@/services/ai";
import { NewAssessmentForm } from "./new-assessment-form";
import { NoticeUploadForm } from "./notice-upload-form";

export const metadata: Metadata = { title: "Add an assessment · PaperKaki" };

/**
 * Screen A: what is your child preparing for? When notices can be read, uploading the school's
 * notice is the one big action and typing the details is a quiet link (ADR-0011); otherwise the
 * details form is the whole screen.
 */
export default async function NewAssessmentPage({ searchParams }: { searchParams: Promise<{ manual?: string }> }) {
  const parent = await requireParent();
  const { children, selectedChildId } = await getParentChildren(parent.parentProfileId);
  const manual = (await searchParams).manual !== undefined;
  const upload = isNoticeUploadAvailable();

  if (upload && !manual) {
    return (
      <>
        <PageHeader title="What is your child preparing for?" description="Upload the school's notice and we'll set it up for you." />
        <NoticeUploadForm
          kids={children}
          selectedChildId={selectedChildId}
          label="Upload school notice"
          hint="A PDF, or a photo or screenshot of the notice."
        />
        <div>
          <ButtonLink href="/prepare/new?manual=1" variant="quiet">
            Enter details myself
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="What is your child preparing for?" />
      <NewAssessmentForm
        kids={children}
        selectedChildId={selectedChildId}
        types={ASSESSMENT_TYPES.map((value) => ({ value, label: ASSESSMENT_TYPE_LABEL[value] }))}
        today={todayInSingapore()}
      />
      {upload ? (
        <div>
          <ButtonLink href="/prepare/new" variant="quiet">
            Upload the school notice instead
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}
