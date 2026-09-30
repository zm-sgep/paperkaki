import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireParent } from "@/application/queries/current-parent";
import { getMarkedPaper, getMarkingStatus } from "@/application/queries/results";
import { MarkedPaper } from "@/components/results/MarkedPaper";
import { finishReviewAction } from "./actions";

export const metadata: Metadata = { title: "Marked paper · PaperKaki" };
export const dynamic = "force-dynamic";

/** The marked paper, mistakes first. Until the paper is marked, back to where marking is. */
export default async function ParentMarkedPaperPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const parent = await requireParent();
  const { attemptId } = await params;
  const paper = await getMarkedPaper({ kind: "parent", parentProfileId: parent.parentProfileId }, attemptId);
  if (!paper) {
    if (await getMarkingStatus({ parentProfileId: parent.parentProfileId }, attemptId)) redirect(`/progress/results/${attemptId}`);
    notFound();
  }
  return <MarkedPaper paper={paper} finishAction={finishReviewAction.bind(null, attemptId)} />;
}
