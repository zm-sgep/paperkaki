import type { ReactNode } from "react";

export type IllustrationProps = {
  /** Size it with height or width classes; the default is 112px tall. Illustrations share one 5:4 frame, so they swap cleanly. */
  className?: string;
};

/**
 * The frame every spot illustration draws in: a 160 x 128 canvas, decorative (hidden from screen
 * readers, no text inside), flat shapes in the brand palette only. Paper objects are white with a
 * 2px warm outline; everything else is a flat fill.
 */
export function Art({ className, children }: IllustrationProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 128"
      className={className ?? "h-28 w-auto"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

/** A four-point sparkle centred on (x, y), `r` points out. */
export function sparklePath(x: number, y: number, r: number): string {
  const k = r * 0.22;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
}
