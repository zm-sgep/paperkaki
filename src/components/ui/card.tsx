import type { ReactNode } from "react";

/** A white surface with a warm border and a soft shadow: 20px corners, generous padding. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-line bg-surface p-5 shadow-card sm:p-6 ${className ?? ""}`.trim()}>
      {children}
    </section>
  );
}
