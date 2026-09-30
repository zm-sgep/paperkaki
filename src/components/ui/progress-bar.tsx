/**
 * A calm horizontal bar for "how far": a value from 0 to 1 and a label for screen readers. The
 * label is also shown unless `hideLabel` is set. Never the only way a number is conveyed: pair
 * it with a count in words where the number matters.
 */
export function ProgressBar({
  value,
  label,
  hideLabel = false,
  tone = "teal",
}: {
  value: number;
  label: string;
  hideLabel?: boolean;
  tone?: "teal" | "kaya";
}) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <div className="flex flex-col gap-2">
      {hideLabel ? null : <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        className="h-2.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full ${tone === "kaya" ? "bg-kaya" : "bg-kaki"}`}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  );
}
