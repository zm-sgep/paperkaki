import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
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
  const latest = setup.mocks[0];
  const requestKey = randomUUID();
  return (
    <>
      <p className="-mb-3 text-base text-ink-soft">{setup.assessment.contextLine}</p>
      <PageHeader title={latest ? "Your mocks" : "Your mock is ready to create"} />

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xl font-semibold text-ink">{setup.summary}</p>
          {setup.topicsLine ? <p className="text-lg text-ink">{setup.topicsLine}</p> : null}
        </div>
        <p data-mock-focus className="text-lg text-ink-soft">
          {setup.focusLine ?? "Each mock uses a new set of questions from the topics you chose."}
        </p>
      </Card>

      {latest ? (
        <>
          <ButtonLink href={latest.href} variant="primary" className="w-full sm:w-auto sm:self-start">
            {`Print Mock ${latest.number}`}
          </ButtonLink>
          <section aria-labelledby="mocks-heading" className="flex flex-col gap-3">
            <h2 id="mocks-heading" className="text-xl font-semibold text-ink">
              Mocks
            </h2>
            <ul className="flex flex-col gap-2">
              {setup.mocks.map((mock) => (
                <li key={mock.id}>
                  <Link
                    href={mock.href}
                    className="flex min-h-12 flex-col justify-center rounded-lg border border-line bg-surface px-4 py-2 hover:bg-kaki-soft sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-lg font-semibold text-ink">{`Mock ${mock.number}`}</span>
                    <span className="text-base text-ink-soft">{mock.createdText}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

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
        requestKey={requestKey}
        canGenerate={setup.canGenerate}
        reason={blocked ? "Make the change above to continue." : null}
        label={latest ? "Create another mock" : "Generate first mock"}
        variant={latest ? "secondary" : "primary"}
      />

      <CustomisePaper
        assessmentId={assessmentId}
        markOptions={setup.markOptions}
        settings={setup.settings}
        usingRecommended={setup.usingRecommended}
        paperFormat={setup.paperFormat}
      />

      <div>
        <ButtonLink href={`/prepare/${assessmentId}/scope`} variant="quiet">
          Change topics
        </ButtonLink>
      </div>
    </>
  );
}
