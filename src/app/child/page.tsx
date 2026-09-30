import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentChild } from "@/application/queries/current-child";
import { Logo } from "@/components/brand/Logo";
import { ChildCard } from "@/components/child/child-card";
import { Sunrise } from "@/components/illustrations";
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
    <div className="min-h-dvh bg-child-canvas font-child text-lg text-ink">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-7 px-6 py-10">
        <Logo size={28} />
        <div className="flex flex-col gap-3">
          <div aria-hidden="true" className="-mb-1 flex">
            <Sunrise className="h-28 w-auto" />
          </div>
          <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">Let&apos;s get you started</h1>
          <p className="text-xl text-ink-soft">Ask a grown-up to show you a 6-digit code.</p>
        </div>
        <ChildCard>
          <PairForm />
        </ChildCard>
        <p className="text-base text-ink-soft">
          <Link href="/sign-in" className="inline-flex min-h-12 items-center underline underline-offset-4">
            Grown-up? Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
