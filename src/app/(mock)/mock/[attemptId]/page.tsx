import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMockRun, getParentAttemptView } from "@/application/queries/attempts";
import { getCurrentChild } from "@/application/queries/current-child";
import { getCurrentParent } from "@/application/queries/current-parent";
import { SubmittedScreen } from "@/components/mock/SubmittedScreen";
import { ButtonLink, buttonClassName } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { handedInText, inProgressOnIpadText, waitingOnTodayText } from "@/domain/attempts";
import { handDeviceAction } from "@/app/(parent)/(main)/account/device-actions";
import { AttemptRunner } from "./attempt-runner";

export const metadata: Metadata = { title: "Your mock · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * /mock/:attemptId. For the child it is Mock Mode itself, in a layout with no app navigation (or the
 * screen before or after it). For the parent whose child the attempt belongs to it is a short status
 * page, so "Continue mock" on Home never takes over the child's paper.
 */
export default async function MockPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;

  const child = await getCurrentChild();
  if (child) {
    const screen = await getMockRun(child, attemptId);
    if (!screen) notFound();
    if (screen.state === "not_started") redirect(`/mock/${attemptId}/start`);
    if (screen.state === "submitted") {
      return (
        <SubmittedScreen>
          <ButtonLink href="/today" className="min-h-14 rounded-2xl px-8 text-xl">
            Back to Today
          </ButtonLink>
        </SubmittedScreen>
      );
    }
    return (
      <AttemptRunner
        paper={screen.paper}
        saved={screen.saved}
        serverElapsedSeconds={screen.elapsedSeconds}
        imageUrls={screen.imageUrls}
      />
    );
  }

  const parent = await getCurrentParent();
  if (!parent) redirect("/child");
  const view = await getParentAttemptView(parent.parentProfileId, attemptId);
  if (!view) notFound();

  const text =
    view.status === "assigned"
      ? waitingOnTodayText(view.mockNumber, view.childNickname)
      : view.status === "in_progress"
        ? inProgressOnIpadText(view.mockNumber, view.childNickname)
        : handedInText(view.mockNumber, view.childNickname);
  const open = view.status === "assigned" || view.status === "in_progress";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-base text-ink-soft">{view.label}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{text}</h1>
        {open ? (
          <p className="text-lg text-ink-soft">
            {view.childNickname} can carry on from their own iPad, or you can hand this device over.
          </p>
        ) : (
          <p className="text-lg text-ink-soft">Marking comes next. Results will be here once it is done.</p>
        )}
      </div>
      {open ? (
        <form action={handDeviceAction.bind(null, view.childId)}>
          <SubmitButton className="w-full sm:w-auto">Hand this device to {view.childNickname}</SubmitButton>
        </form>
      ) : null}
      <div>
        <Link href="/home" className={buttonClassName(open ? "quiet" : "primary")}>
          Back to Home
        </Link>
      </div>
    </main>
  );
}
