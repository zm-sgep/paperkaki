import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMockPage } from "@/application/queries/papers";
import { requireParent } from "@/application/queries/current-parent";
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
      <p className="-mb-3 text-base text-ink-soft">{mock.contextLine}</p>
      <PageHeader title={mock.heading} />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xl font-semibold text-ink">{mock.summary}</p>
          {mock.topicsLine ? <p className="text-lg text-ink-soft">{mock.topicsLine}</p> : null}
        </div>
        {/* Plain links, not next/link: these answer with a redirect to a private file, never a page. */}
        <a
          href={mock.studentHref}
          target="_blank"
          rel="noopener noreferrer"
          data-variant="primary"
          className={`${buttonClassName("primary")} w-full sm:w-auto sm:self-start`}
        >
          Download mock paper
        </a>
        <p className="text-lg text-ink-soft">{mock.tip}</p>
        <IpadOption paperId={mock.paperId} childNickname={mock.childNickname} status={mock.ipad} />
        {mock.upload.attempt ? (
          <p data-upload-status className="text-lg text-ink">
            {mock.upload.attempt.message}{" "}
            <Link href={mock.upload.attempt.href} className="font-semibold text-kaki underline underline-offset-4">
              See results
            </Link>
          </p>
        ) : null}
        {mock.upload.available ? (
          <div className="flex flex-col gap-1">
            <Link href={mock.upload.href} data-variant="secondary" className={`${buttonClassName("secondary")} w-full sm:w-auto sm:self-start`}>
              Upload the finished paper
            </Link>
            <p className="text-base text-ink-soft">Photos of each page, once {mock.childNickname} has written on the printed paper.</p>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-col gap-2">
        <a
          href={mock.answersHref}
          target="_blank"
          rel="noopener noreferrer"
          data-variant="secondary"
          className={`${buttonClassName("secondary")} w-full sm:w-auto sm:self-start`}
        >
          Download answer pack
        </a>
        <p className="text-base text-ink-soft">{mock.answerPackNote}</p>
      </div>

      <div>
        <Link href={mock.backHref} className={buttonClassName("quiet")}>
          All mocks
        </Link>
      </div>
    </>
  );
}
