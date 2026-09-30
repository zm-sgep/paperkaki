import Link from "next/link";
import type { ReactNode } from "react";
import { requireChild } from "@/application/queries/current-child";
import { ChildNav } from "@/components/child/child-nav";
import { Sunrise } from "@/components/illustrations";

/**
 * The child shell (UX-02): a warmer page, Nunito at 18px and rounded cards; "Hi {name}" with a small
 * sun on top; exactly four destinations; no account, settings or parent actions. The session is verified
 * here on the server; the proxy is only a fast redirect. The one way out is a quiet link for grown-ups.
 */
export default async function ChildLayout({ children }: { children: ReactNode }) {
  const child = await requireChild();
  return (
    <div data-child-shell className="min-h-dvh bg-child-canvas font-child text-lg text-ink">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-2 border-b border-child-line bg-child-card/95 px-4 backdrop-blur sm:px-6">
        <Sunrise className="-ml-1 h-12 w-auto shrink-0" />
        <p className="min-w-0 truncate text-2xl font-extrabold tracking-tight text-kaki-strong">Hi {child.nickname}</p>
      </header>
      <ChildNav />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-32 pt-24 sm:px-6 md:ml-64 md:max-w-none md:px-10 md:pb-12">
        <div className="flex w-full max-w-3xl flex-col gap-6 has-[[data-wide-page]]:max-w-none">
          {children}
          <p className="pt-4 text-base text-ink-soft">
            <Link href="/sign-in" className="inline-flex min-h-12 items-center underline underline-offset-4">
              Grown-up? Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
