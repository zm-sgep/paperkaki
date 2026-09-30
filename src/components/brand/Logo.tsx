/**
 * The PaperKaki mark: a paper sheet with a folded corner and a friendly tick, in kaki teal with a
 * kaya yellow fold. Drawn with few shapes so it stays crisp at 24px. The same mark, on a teal
 * tile, is the favicon and app icon (src/app/icon.svg).
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`shrink-0 ${className ?? ""}`.trim()}
    >
      <path
        d="M9 3h10.5L27 10.5V25a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z"
        className="fill-kaki"
      />
      <path d="M19.5 3v4.5a3 3 0 0 0 3 3H27L19.5 3Z" className="fill-kaya" />
      <path
        d="m10.5 19.2 3.7 3.6 7.3-7.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The mark and the "PaperKaki" wordmark. The wordmark is real text (the mark is decorative), so it
 * reads and scales like any other text. `size` is the height of the mark in pixels.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`.trim()}>
      <LogoMark size={size} />
      <span
        className="font-extrabold leading-none tracking-tight text-ink"
        style={{ fontSize: `${Math.round(size * 0.82)}px` }}
      >
        Paper<span className="text-kaki">Kaki</span>
      </span>
    </span>
  );
}
