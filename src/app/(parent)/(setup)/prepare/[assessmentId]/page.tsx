import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getAssessmentSetup } from "@/application/queries/assessment-setup";
import { requireParent } from "@/application/queries/current-parent";
import { ReadyPaper } from "@/components/illustrations";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
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
      <p className="-mb-3 text-base font-medium text-ink-soft">{setup.assessment.contextLine}</p>
      <PageHeader title={latest ? "Your mocks" : "Your mock is ready to create"} />

      <Card className="flex flex-col gap-5 md:flex-row-reverse md:items-center md:justify-between md:gap-8">
        <div aria-hidden="true" className="flex shrink-0 justify-center">
          <ReadyPaper className="h-28 w-auto md:h-36" />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xl font-bold tracking-tight text-ink">{setup.summary}</p>
            <div className="flex flex-wrap gap-2">
              {setup.paperFormat.current.parts.map((part) => (
                <Chip key={part.label} tone="teal">
                  {part.label} · {part.totalMarks} {part.totalMarks === 1 ? "mark" : "marks"}
                </Chip>
              ))}
            </div>
            {setup.topicsLine ? <p className="pt-1 text-base text-ink">{setup.topicsLine}</p> : null}
          </div>
          <p data-mock-focus className="text-lg text-ink-soft">
            {setup.focusLine ?? "Each mock uses a new set of questions from the topics you chose."}
          </p>
        </div>
      </Card>

      {latest ? (
        <>
          <ButtonLink href={latest.href} variant="primary" size="lg" className="w-full sm:w-auto sm:self-start">
            {`Print Mock ${latest.number}`}
          </ButtonLink>
          <section aria-labelledby="mocks-heading" className="flex flex-col gap-3">
            <h2 id="mocks-heading" className="text-xl font-bold tracking-tight text-ink">
              Mocks
            </h2>
            <ul className="flex flex-col gap-2">
              {setup.mocks.map((mock) => (
                <li key={mock.id}>
                  <Link
                    href={mock.href}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-2 shadow-card transition-colors hover:border-kaki/40 hover:bg-kaki-soft"
                  >
                    <span className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-4">
                      <span className="text-lg font-semibold text-ink">{`Mock ${mock.number}`}</span>
                      <span className="text-base text-ink-soft">{mock.createdText}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {setup.excludedNotice ? (
        <Notice role="note">
          <p>{setup.excludedNotice}</p>
        </Notice>
      ) : null}

      {blocked ? (
        <Notice tone="alert" role="alert">
          <p className="font-semibold text-danger">This mock needs a change first</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {setup.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Notice>
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
