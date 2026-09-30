import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentChild } from "@/application/queries/current-child";
import { PairForm } from "./pair-form";

export const metadata: Metadata = { title: "PaperKaki" };
export const dynamic = "force-dynamic";

/**
 * Where a child's device starts: one box for the code a parent reads out. A device that is
 * already set up goes straight to Today. The only other way out is a quiet link for grown-ups.
 */
export default async function ChildEntryPage() {
  if (await getCurrentChild()) redirect("/today");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 bg-child-canvas px-6 py-12 text-lg">
      <div className="flex flex-col gap-2">
        <p className="text-xl font-semibold tracking-tight text-kaki">PaperKaki</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Let&apos;s get you started</h1>
        <p className="text-ink-soft">Ask a grown-up to show you a 6-digit code.</p>
      </div>
      <PairForm />
      <p className="text-base text-ink-soft">
        <Link href="/sign-in" className="inline-flex min-h-12 items-center underline underline-offset-4">
          Grown-up? Sign in
        </Link>
      </p>
    </main>
  );
}
