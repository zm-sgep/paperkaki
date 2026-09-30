import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getNoticeScreen } from "@/application/queries/notice-sources";
import { requireParent } from "@/application/queries/current-parent";
import { PageHeader } from "@/components/ui/page-header";
import { NoticeFailed } from "./notice-failed";
import { NoticeProcessing } from "./notice-processing";
import { NoticeReviewForm } from "./notice-review-form";

export const metadata: Metadata = { title: "Your school notice · PaperKaki" };

/**
 * Screen B: "We found this". This route lives in the (setup) group, outside (main), on purpose: the
 * (main) group has a loading skeleton, and streaming that skeleton would send HTTP 200 before
 * `notFound()` can answer 404 for someone else's notice.
 *
 * While the notice is being read the same address shows the calm "Reading the notice" steps; when
 * reading has failed it says what happened and what to do; when it has finished it shows what was found.
 */
export default async function NoticePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const parent = await requireParent();
  const { sourceId } = await params;
  const screen = await getNoticeScreen(parent.parentProfileId, sourceId);
  if (!screen) notFound();

  switch (screen.state) {
    case "confirmed":
      redirect(`/prepare/${screen.assessmentId}`);
    // redirect() never returns; the next case is not reached.
    case "processing":
      return <NoticeProcessing sourceId={sourceId} />;
    case "failed":
      return <NoticeFailed sourceId={sourceId} code={screen.code} retry={screen.retry} childId={screen.childId} />;
    case "found":
      return (
        <>
          <PageHeader title="We found this" description={`${screen.view.childNickname} · Mathematics`} />
          <NoticeReviewForm view={screen.view} />
        </>
      );
  }
}
