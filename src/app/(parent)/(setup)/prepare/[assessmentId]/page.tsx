import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAssessmentSetup } from "@/application/queries/assessment-setup";
import { requireParent } from "@/application/queries/current-parent";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CustomisePaper } from "./customise-paper";
import { GenerateMockForm } from "./generate-mock-form";

export const metadata: Metadata = { title: "Your mock · PaperKaki" };

/**
 * This route lives in the (setup) group, outside (main), on purpose: the (main) group has a
 * loading skeleton, and streaming that skeleton would send HTTP 200 before `notFound()` can
 * answer 404 for someone else's assessment.
 *
 * Screen C: your mock is ready to create. One sentence, one primary button, settings tucked away. */
export default async function AssessmentPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const parent = await requireParent();
  const { assessmentId } = await params;
  const setup = await getAssessmentSetup(parent.parentProfileId, assessmentId);
  if (!setup) notFound();
  if (!setup.assessment.scopeConfirmed) redirect(`/prepare/${assessmentId}/scope`);

  const blocked = setup.problems.length > 0;
  return (
    <>
      <p className="-mb-3 text-base text-ink-soft">{setup.assessment.contextLine}</p>
      <PageHeader title="Your mock is ready to create" />

      <Card className="flex flex-col gap-3">
        <p className="text-xl font-semibold text-ink">{setup.summary}</p>
        <p className="text-lg text-ink-soft">Each mock uses a new set of questions from the topics you chose.</p>
      </Card>

      {setup.excludedNotice ? (
        <p role="note" className="rounded-lg border border-line bg-surface px-4 py-3 text-lg text-ink">
          {setup.excludedNotice}
        </p>
      ) : null}

      {blocked ? (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border-2 border-danger bg-surface px-4 py-3">
          <p className="text-lg font-semibold text-danger">This mock needs a change first</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-lg text-ink">
            {setup.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {setup.notices.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-lg text-ink-soft">
          {setup.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}

      <GenerateMockForm
        assessmentId={assessmentId}
        canGenerate={setup.canGenerate}
        reason={blocked ? "Make the change above to continue." : null}
      />

      <CustomisePaper
        assessmentId={assessmentId}
        markOptions={setup.markOptions}
        settings={setup.settings}
        usingRecommended={setup.usingRecommended}
      />

      <div>
        <ButtonLink href={`/prepare/${assessmentId}/scope`} variant="quiet">
          Change topics
        </ButtonLink>
      </div>
    </>
  );
}
