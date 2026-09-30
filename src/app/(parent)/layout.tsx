import Link from "next/link";
import type { ReactNode } from "react";
import { getParentChildren } from "@/application/queries/children";
import { requireParent } from "@/application/queries/current-parent";
import { ChildSelector } from "@/components/parent/child-selector";
import { ParentNav } from "@/components/parent/parent-nav";
import { selectChildAction } from "./actions";

/**
 * The parent shell: wordmark, the child selector and the account button on top, the four destinations as bottom tabs
 * (phone) or a left sidebar (iPad and desktop). Account is reached from the top bar, never from
 * the navigation. The session is verified here on the server; the proxy is only a fast redirect.
 */
export default async function ParentLayout({ children }: { children: ReactNode }) {
  const parent = await requireParent();
  const { children: kids, selectedChildId } = await getParentChildren(parent.parentProfileId);
  const initial = Array.from(parent.displayName.trim())[0]?.toUpperCase() ?? "?";

  return (
    <div className="min-h-dvh">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
        <span className="text-xl font-semibold tracking-tight text-kaki">PaperKaki</span>
        <div className="flex items-center gap-3">
          <ChildSelector options={kids} selectedChildId={selectedChildId} onSelect={selectChildAction} />
          <Link
            href="/account"
            aria-label="Account"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-kaki text-lg font-semibold text-white hover:bg-kaki-strong"
          >
            <span aria-hidden="true">{initial}</span>
          </Link>
        </div>
      </header>
      <ParentNav />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-28 pt-24 sm:px-6 md:ml-60 md:max-w-none md:px-10 md:pb-12">
        <div className="flex w-full max-w-3xl flex-col gap-6 has-[[data-wide-page]]:max-w-none">{children}</div>
      </main>
    </div>
  );
}
