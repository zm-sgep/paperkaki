import type { ReactNode } from "react";

export type ChipTone = "neutral" | "teal" | "kaya" | "coral";

/** Every tone keeps its text at 4.5:1 or better on its own tint (checked in tests/unit/design-tokens.test.ts). */
const tones: Record<ChipTone, string> = {
  neutral: "border-line bg-surface text-ink-soft",
  teal: "border-kaki/15 bg-kaki-soft text-kaki-strong",
  kaya: "border-kaya/40 bg-kaya-soft text-kaya-strong",
  coral: "border-coral/30 bg-coral-soft text-coral-strong",
};

/**
 * A small pill for a fact or a state: "in 13 days", "Topics confirmed", "Section A · 12 marks".
 * It is a label, never a control, so it is not a touch target. The text carries the meaning; the
 * tint and the optional icon only support it.
 */
export function Chip({
  tone = "neutral",
  icon,
  children,
  className,
  ...rest
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-numeric"?: boolean;
}) {
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold leading-snug ${tones[tone]} ${className ?? ""}`.trim()}
    >
      {icon ? (
        <span aria-hidden="true" className="flex shrink-0 items-center [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
