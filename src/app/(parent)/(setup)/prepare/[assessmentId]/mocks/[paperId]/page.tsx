import { ArrowLeft, Download, FileCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMockPage } from "@/application/queries/papers";
import { requireParent } from "@/application/queries/current-parent";
import { CheckCircleBurst } from "@/components/illustrations";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { IpadOption } from "./ipad-option";

export const metadata: Metadata = { title: "Your mock · PaperKaki" };

/**
 * The printed mock is ready: one primary action (the paper the child will write on), the answer
 * pack as a quiet second choice, and one tip. No points, no charts. Lives in the (setup) group,
 * outside (main), so notFound() can still answer 404 for someone else's paper.
 */
export default async function MockPage({ params }: { params: Promise<{ assessmentId: string; paperId: string }> }) {
  const parent = await requireParent();
  const { assessmentId, paperId } = await params;
  const mock = await getMockPage(parent.parentProfileId, assessmentId, paperId);
  if (!mock) notFound();

  return (
    <>
      <p className="-mb-3 text-base font-medium text-ink-soft">{mock.contextLine}</p>
      <PageHeader title={mock.heading} />

      <Card className="flex flex-col gap-6 md:flex-row-reverse md:items-start md:justify-between md:gap-8">
        <div aria-hidden="true" className="flex shrink-0 justify-center md:pt-2">
          <CheckCircleBurst className="h-28 w-auto md:h-36" />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xl font-bold tracking-tight text-ink">{mock.summary}</p>
            {mock.topicsLine ? <p className="text-base text-ink-soft">{mock.topicsLine}</p> : null}
          </div>
          {/* Plain links, not next/link: these answer with a redirect to a private file, never a page. */}
          <a
            href={mock.studentHref}
            target="_blank"
            rel="noopener noreferrer"
            data-variant="primary"
            className={`${buttonClassName("primary", "lg")} w-full sm:w-auto sm:self-start`}
          >
            <Download aria-hidden="true" className="h-5 w-5" />
            Download mock paper
          </a>
          <p className="text-lg text-ink-soft">{mock.tip}</p>
          <IpadOption paperId={mock.paperId} childNickname={mock.childNickname} status={mock.ipad} />
          {mock.upload.attempt ? (
            <p data-upload-status className="text-lg text-ink">
              {mock.upload.attempt.message}{" "}
              <Link href={mock.upload.attempt.href} className="font-semibold text-kaki-strong underline underline-offset-4">
                See results
              </Link>
            </p>
          ) : null}
          {mock.upload.available ? (
            <div className="flex flex-col gap-2">
              <Link href={mock.upload.href} data-variant="secondary" className={`${buttonClassName("secondary")} w-full sm:w-auto sm:self-start`}>
                Upload the finished paper
              </Link>
              <p className="text-base text-ink-soft">Photos of each page, once {mock.childNickname} has written on the printed paper.</p>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        <a
          href={mock.answersHref}
          target="_blank"
          rel="noopener noreferrer"
          data-variant="secondary"
          className={`${buttonClassName("secondary")} w-full sm:w-auto sm:self-start`}
        >
          <FileCheck aria-hidden="true" className="h-5 w-5" />
          Download answer pack
        </a>
        <p className="text-base text-ink-soft">{mock.answerPackNote}</p>
      </div>

      <div>
        <Link href={mock.backHref} className={buttonClassName("quiet", "md", { flush: true })}>
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          All mocks
        </Link>
      </div>
    </>
  );
}
