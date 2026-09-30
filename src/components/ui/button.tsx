import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
/** Every size is at least 48px tall; `lg` is the roomier one for a screen's main action, `xl` the child's. */
export type ButtonSize = "sm" | "md" | "lg" | "xl";
/** `control` is the 12px corner the parent screens use; `pill` is the fully round one the child screens use. */
export type ButtonShape = "control" | "pill";

const base =
  "inline-flex min-h-12 min-w-12 select-none items-center justify-center gap-2 text-base font-semibold leading-tight transition-[background-color,border-color,box-shadow,color,transform] duration-150 active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-kaki disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";

const shapes: Record<ButtonShape, string> = {
  control: "rounded-control",
  pill: "rounded-full",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-4 py-2.5",
  md: "px-5 py-3",
  lg: "min-h-14 px-7 py-3.5 text-lg",
  xl: "min-h-16 px-9 py-4 text-xl font-bold",
};

/** A quiet button is text with a tint on hover, so it needs less padding than one with a fill or an edge. */
const quietSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-2.5",
  md: "px-3 py-3",
  lg: "min-h-14 px-4 py-3.5 text-lg",
  xl: "min-h-16 px-5 py-4 text-xl font-bold",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-kaki text-white shadow-button hover:bg-kaki-hover active:bg-kaki-hover disabled:bg-line disabled:text-ink-soft disabled:shadow-none aria-disabled:bg-line aria-disabled:text-ink-soft aria-disabled:shadow-none",
  secondary:
    "border-[1.5px] border-kaki bg-surface text-kaki-strong hover:bg-kaki-soft active:bg-kaki-soft disabled:border-line disabled:bg-surface disabled:text-ink-soft aria-disabled:border-line aria-disabled:bg-surface aria-disabled:text-ink-soft",
  danger:
    "border-[1.5px] border-danger bg-surface text-danger hover:bg-danger hover:text-white active:bg-danger active:text-white disabled:border-line disabled:bg-surface disabled:text-ink-soft aria-disabled:border-line aria-disabled:bg-surface aria-disabled:text-ink-soft",
  // The ring hugs the box (no offset) so a quiet link pulled to the page edge never has its ring cut off.
  quiet:
    "text-kaki-strong underline-offset-4 hover:bg-kaki-soft hover:underline active:bg-kaki-soft focus-visible:outline-offset-0 disabled:text-ink-soft aria-disabled:text-ink-soft",
};

export type ButtonStyleOptions = {
  shape?: ButtonShape;
  /**
   * A quiet link standing on its own line: pulled left by its own padding so the words line up with the page's
   * left edge (and with the headings above), while the tinted box and focus ring stay on the screen.
   */
  flush?: boolean;
};

export function buttonClassName(variant: ButtonVariant = "primary", size: ButtonSize = "md", options: ButtonStyleOptions = {}): string {
  const { shape = "control", flush = false } = options;
  const flushClass = flush && variant === "quiet" ? (size === "lg" ? " -ml-4" : size === "xl" ? " -ml-5" : " -ml-3") : "";
  return `${base} ${shapes[shape]} ${variant === "quiet" ? quietSizes[size] : sizes[size]} ${variants[variant]}${flushClass}`;
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} animate-spin`} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  flush?: boolean;
  /** Shows a spinner, keeps the label and blocks repeat presses. Announced as busy. */
  loading?: boolean;
};

/**
 * The one button. At least 48px tall, visible focus ring. Disabled and loading states change
 * more than colour: the cursor, the spinner and `aria-busy` all change too.
 */
export function Button({ variant = "primary", size = "md", shape = "control", flush = false, loading = false, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`${buttonClassName(variant, size, { shape, flush })} ${className ?? ""}`.trim()}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

/** A link that looks and sizes like a Button. Use for navigation; use Button for actions. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  shape = "control",
  flush = false,
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; shape?: ButtonShape; flush?: boolean }) {
  return <Link {...rest} data-variant={variant} className={`${buttonClassName(variant, size, { shape, flush })} ${className ?? ""}`.trim()} />;
}
