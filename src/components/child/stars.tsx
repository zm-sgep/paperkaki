import { MAX_STARS } from "@/domain/mastery";

/**
 * A child's picture of how a topic is going: 0 to 4 filled stars. A filled star and an empty star differ in
 * shape as well as colour, and the whole picture has one plain label for a screen reader. Never a number.
 */
export function Stars({ count, label }: { count: number; label?: string }) {
  const filled = Math.max(0, Math.min(MAX_STARS, Math.round(count)));
  return (
    <span data-stars={filled} role="img" aria-label={label ?? `${filled} of ${MAX_STARS} stars`} className="inline-flex gap-0.5 text-2xl leading-none text-kaki">
      {Array.from({ length: MAX_STARS }, (_, index) => (
        <span key={index} aria-hidden="true" className={index < filled ? "text-kaki" : "text-child-line"}>
          {index < filled ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
