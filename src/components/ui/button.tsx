import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet";

const base =
  "inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-lg px-5 py-3 text-base font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-kaki disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-kaki text-white hover:bg-kaki-strong disabled:bg-line disabled:text-ink-soft aria-disabled:bg-line aria-disabled:text-ink-soft",
  secondary:
    "border-2 border-kaki bg-surface text-kaki hover:bg-kaki-soft disabled:border-line disabled:text-ink-soft aria-disabled:border-line aria-disabled:text-ink-soft",
  quiet: "text-kaki underline-offset-4 hover:bg-kaki-soft hover:underline disabled:text-ink-soft",
};

export function buttonClassName(variant: ButtonVariant = "primary"): string {
  return `${base} ${variants[variant]}`;
}

function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Shows a spinner, keeps the label and blocks repeat presses. Announced as busy. */
  loading?: boolean;
};

/**
 * The one button. At least 48px tall, visible focus ring. Disabled and loading states change
 * more than colour: the cursor, the spinner and `aria-busy` all change too.
 */
export function Button({ variant = "primary", loading = false, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`${buttonClassName(variant)} ${className ?? ""}`.trim()}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

/** A link that looks and sizes like a Button. Use for navigation; use Button for actions. */
export function ButtonLink({
  variant = "primary",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...rest} data-variant={variant} className={`${buttonClassName(variant)} ${className ?? ""}`.trim()} />;
}
