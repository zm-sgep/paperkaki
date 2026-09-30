import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMockStart } from "@/application/queries/attempts";
import { getCurrentChild } from "@/application/queries/current-child";
import { LogoMark } from "@/components/brand/Logo";
import { SubmitButton } from "@/components/ui/submit-button";
import { startAttemptAction } from "../actions";

export const metadata: Metadata = { title: "Your mock · PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * Before the mock (UX_SPEC 9): the paper's name, marks, time and number of questions, three calm
 * lines, and one Start button. No points, rewards or offers, and no app navigation.
 */
export default async function MockStartPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const child = await getCurrentChild();
  if (!child) redirect(`/mock/${attemptId}`);
  const screen = await getMockStart(child, attemptId);
  if (!screen) notFound();
  // Already started or handed in: carry on from where the paper is.
  if (screen.status !== "assigned") redirect(`/mock/${attemptId}`);

  return (
    <main data-mock-start className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-9 bg-paper px-6 py-12 text-lg text-ink">
      <LogoMark size={28} />
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{screen.title}</h1>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xl font-medium text-ink-soft">
          <li>{screen.facts.marks}</li>
          <li>{screen.facts.duration}</li>
          <li>{screen.facts.questions}</li>
        </ul>
      </div>
      <ol className="flex list-decimal flex-col gap-3 pl-6 text-xl marker:font-semibold marker:text-ink-soft">
        {screen.instructions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <form action={startAttemptAction.bind(null, attemptId)} className="flex flex-col gap-3">
        <SubmitButton className="min-h-16 w-full rounded-2xl text-2xl">Start</SubmitButton>
      </form>
      <p>
        <Link href="/today" className="inline-flex min-h-12 items-center text-base text-ink-soft underline underline-offset-4">
          Not now
        </Link>
      </p>
    </main>
  );
}
