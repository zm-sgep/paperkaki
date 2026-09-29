import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6 ${className ?? ""}`.trim()}>
      {children}
    </section>
  );
}
