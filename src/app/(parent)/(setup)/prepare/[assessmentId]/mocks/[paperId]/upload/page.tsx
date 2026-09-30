import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/application/queries/current-parent";
import { getUploadScreen } from "@/application/queries/print-upload";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { UploadPages } from "./upload-pages";

export const metadata: Metadata = { title: "Upload the finished paper · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * Upload the finished paper: photos of each page (or a PDF), the pages in order, only a page with a
 * problem flagged, and one primary action. Lives in (setup), so a paper that is not theirs answers 404.
 */
export default async function UploadPage({ params }: { params: Promise<{ assessmentId: string; paperId: string }> }) {
  const parent = await requireParent();
  const { assessmentId, paperId } = await params;
  const screen = await getUploadScreen(parent.parentProfileId, assessmentId, paperId);
  if (!screen) notFound();

  return (
    <>
      <p className="-mb-3 text-base text-ink-soft">{screen.label}</p>
      <PageHeader
        title="Upload the finished paper"
        description={`Take a photo of each page of ${screen.childNickname}'s paper, in order. Keep the whole page in view and the paper upright.`}
      />
      <UploadPages paperId={screen.paperId} pages={screen.pages} countNote={screen.countNote} available={screen.available} blocked={screen.blocked} />
      <div>
        <Link href={screen.backHref} className={buttonClassName("quiet")}>
          Back to the mock
        </Link>
      </div>
    </>
  );
}
