import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentParent } from "@/application/queries/current-parent";
import { Logo } from "@/components/brand/Logo";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · PaperKaki" };

export default async function SignInPage() {
  if (await getCurrentParent()) {
    redirect("/home");
  }
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Two soft shapes for warmth. Decorative, and they never take space. */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-kaki-soft" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-kaya-soft" />
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size={40} />
          <p className="max-w-xs text-lg text-ink-soft">PaperKaki makes practice papers for your child&apos;s next school assessment.</p>
        </div>
        <div className="flex flex-col gap-6 rounded-hero border border-line bg-surface p-6 shadow-hero sm:p-8">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink">Sign in</h1>
          <SignInForm />
        </div>
      </main>
    </div>
  );
}
