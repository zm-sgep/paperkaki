import { Check } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A large tappable choice: a radio (pick one) or a checkbox (pick several). At least 56px tall.
 * The selected state is shown by a tick, a heavier border and a tint, never by colour alone, and
 * the native input stays in the page (visually hidden) so keyboards and screen readers work.
 *
 * `icon` adds a decorative picture on the left (for choices that are things, like "End-of-year exam").
 * Leave it out for plain rows such as a topic list; the tick is then the only icon in the row.
 */
export function ChoiceCard({
  type,
  name,
  value,
  label,
  hint,
  icon,
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
  icon?: ReactNode;
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
      <span className="flex min-h-14 items-center gap-3 rounded-control border-[1.5px] border-line bg-surface px-4 py-3 text-lg text-ink shadow-[0_1px_1px_rgb(29_42_46/0.03)] transition-[border-color,background-color,box-shadow] duration-150 group-hover:border-kaki/50 group-has-checked:border-kaki group-has-checked:bg-kaki-soft group-has-checked:font-semibold group-has-checked:shadow-[inset_0_0_0_1px_var(--color-kaki)] group-has-focus-visible:outline-3 group-has-focus-visible:outline-offset-3 group-has-focus-visible:outline-kaki group-has-disabled:cursor-not-allowed group-has-disabled:opacity-60">
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center border-[1.5px] border-line-strong bg-surface text-white transition-colors duration-150 group-has-checked:border-kaki group-has-checked:bg-kaki ${
            type === "radio" ? "rounded-full" : "rounded-md"
          }`}
        >
          <Check className="h-4 w-4 opacity-0 group-has-checked:opacity-100" strokeWidth={3.5} />
        </span>
        {icon ? (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kaki-soft text-kaki-strong transition-colors group-has-checked:bg-white [&>svg]:h-6 [&>svg]:w-6"
          >
            {icon}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col">
          <span>{label}</span>
          {hint ? <span className="text-sm font-normal text-ink-soft">{hint}</span> : null}
        </span>
      </span>
    </label>
  );
}
