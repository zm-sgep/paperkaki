import { CircleAlert, Info } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * A short message inside a page. `info` is a calm teal note; `alert` is a gentle coral one for "look at
 * this" (never red, never a siren). The words carry the meaning, so the icon is decoration. Pass `role`
 * (`alert`, `status` or `note`) when assistive technology should hear it.
 */
export function Notice({
  tone = "info",
  children,
  className,
  ...rest
}: { tone?: "info" | "alert"; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const Icon = tone === "alert" ? CircleAlert : Info;
  return (
    <div
      {...rest}
      className={`flex items-start gap-3 rounded-control px-4 py-3 text-lg text-ink ${
        tone === "alert" ? "border border-coral/40 bg-coral-soft" : "bg-kaki-soft"
      } ${className ?? ""}`.trim()}
    >
      <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "alert" ? "text-coral-strong" : "text-kaki-strong"}`} strokeWidth={2.25} />
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  );
}
