import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentParent } from "@/application/queries/current-parent";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · PaperKaki" };

export default async function SignInPage() {
  if (await getCurrentParent()) {
    redirect("/home");
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="text-xl font-semibold tracking-tight text-kaki">PaperKaki</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Sign in</h1>
      </div>
      <SignInForm />
    </main>
  );
}
