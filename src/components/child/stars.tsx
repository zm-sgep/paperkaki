import { Star } from "lucide-react";
import { MAX_STARS } from "@/domain/mastery";

/**
 * A child's picture of how a topic is going: 0 to 4 stars. A filled star (kaya yellow with a dark edge) and
 * an empty star (an outline) differ in shape as well as colour, and the whole picture has one plain label
 * for a screen reader. Never a number.
 */
export function Stars({ count, label, size = "md" }: { count: number; label?: string; size?: "md" | "lg" }) {
  const filled = Math.max(0, Math.min(MAX_STARS, Math.round(count)));
  const box = size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <span data-stars={filled} role="img" aria-label={label ?? `${filled} of ${MAX_STARS} stars`} className="inline-flex gap-1">
      {Array.from({ length: MAX_STARS }, (_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          strokeWidth={1.75}
          className={`${box} shrink-0 ${index < filled ? "fill-kaya stroke-kaya-strong" : "fill-transparent stroke-line-strong"}`}
        />
      ))}
    </span>
  );
}
