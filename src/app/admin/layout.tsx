import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { requireAdmin } from "@/application/queries/current-parent";

/**
 * Admin has its own layout and no family navigation (ADR-0007, ADR-0009). Non-admins get a 404.
 * Nothing in the family UI links here.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <Logo size={26} />
        <span className="rounded-full bg-kaya-soft px-2.5 py-0.5 text-sm font-semibold text-kaya-strong">admin</span>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
