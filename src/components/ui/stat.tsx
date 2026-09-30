import type { ReactNode } from "react";

/** A number that matters, big, with its label under it. Numerals are tabular so columns of them line up. */
export function Stat({
  value,
  label,
  tone = "ink",
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: "ink" | "teal" | "kaya";
  className?: string;
}) {
  const color = tone === "teal" ? "text-kaki-strong" : tone === "kaya" ? "text-kaya-strong" : "text-ink";
  return (
    <div className={`flex flex-col gap-0.5 ${className ?? ""}`.trim()}>
      <span data-numeric className={`text-3xl font-bold leading-none tracking-tight ${color}`}>
        {value}
      </span>
      <span className="text-sm font-medium text-ink-soft">{label}</span>
    </div>
  );
}
