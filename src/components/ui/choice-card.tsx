import type { ReactNode } from "react";

/**
 * A large tappable choice: a radio (pick one) or a checkbox (pick several). At least 56px tall.
 * The selected state is shown by a tick, a heavier border and a tint, never by colour alone, and
 * the native input stays in the page (visually hidden) so keyboards and screen readers work.
 */
export function ChoiceCard({
  type,
  name,
  value,
  label,
  hint,
  checked,
  defaultChecked,
  onChange,
  disabled,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="group relative block cursor-pointer">
      <input
        type={type}
        name={name}
        value={value}
        className="peer sr-only"
        {...(checked !== undefined ? { checked } : { defaultChecked })}
        disabled={disabled}
        onChange={onChange ? (event) => onChange(event.currentTarget.checked) : undefined}
      />
      <span className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-line bg-surface px-4 py-3 text-lg text-ink transition-colors group-hover:border-kaki/60 group-has-checked:border-kaki group-has-checked:bg-kaki-soft group-has-checked:font-semibold group-has-focus-visible:outline-3 group-has-focus-visible:outline-offset-3 group-has-focus-visible:outline-kaki">
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 border-line bg-surface text-white group-has-checked:border-kaki group-has-checked:bg-kaki ${
            type === "radio" ? "rounded-full" : "rounded-md"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-0 group-has-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        </span>
        <span className="flex flex-col">
          <span>{label}</span>
          {hint ? <span className="text-sm font-normal text-ink-soft">{hint}</span> : null}
        </span>
      </span>
    </label>
  );
}
