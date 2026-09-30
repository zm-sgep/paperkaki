import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireChild } from "@/application/queries/current-child";
import { getMarkedPaper, getMarkingStatus } from "@/application/queries/results";
import { MarkedPaper } from "@/components/results/MarkedPaper";
import { finishReviewAction } from "./actions";

export const metadata: Metadata = { title: "Your marked paper · PaperKaki" };
export const dynamic = "force-dynamic";

export default async function ChildMarkedPaperPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const child = await requireChild();
  const { attemptId } = await params;
  const paper = await getMarkedPaper({ kind: "child", childId: child.childId }, attemptId);
  if (!paper) {
    if (await getMarkingStatus({ childId: child.childId }, attemptId)) redirect(`/results/${attemptId}`);
    notFound();
  }
  return <MarkedPaper paper={paper} finishAction={finishReviewAction.bind(null, attemptId)} />;
}
