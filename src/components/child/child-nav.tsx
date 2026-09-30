"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Destination = { href: string; label: string; icon: ReactNode };

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-7 w-7 shrink-0",
} as const;

/** The four child destinations (docs/INFORMATION_ARCHITECTURE.md section 2). A fifth needs a new ADR. */
const DESTINATIONS: readonly Destination[] = [
  {
    href: "/today",
    label: "Today",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" />
      </svg>
    ),
  },
  {
    href: "/practice",
    label: "Practice",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20l3.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11z" />
        <path d="M13.5 7.5l3 3" />
      </svg>
    ),
  },
  {
    href: "/progress",
    label: "Progress",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V11M10 20V5M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    href: "/rewards",
    label: "Rewards",
    icon: (
      <svg {...iconProps}>
        <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7" />
        <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C10 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 1 0 0-5C14 2 12 7 12 7Z" />
      </svg>
    ),
  },
];

/** Progress and Rewards are served from /kid/... behind the same address (see proxy.ts); either counts. */
function isActive(pathname: string, href: string): boolean {
  const path = pathname.startsWith("/kid/") ? pathname.slice(4) : pathname;
  return path === href || path.startsWith(`${href}/`);
}

/**
 * One nav element: a bottom tab bar under 768px, a left sidebar from 768px up. Same four items in
 * the same order, always with a text label. The active item has a heavier label, a filled pill and a
 * bar as well as its colour, and `aria-current="page"`. Every target is at least 56px tall.
 */
export function ChildNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-child-line bg-child-card pb-[env(safe-area-inset-bottom)] md:top-16 md:right-auto md:w-64 md:border-r-2 md:border-t-0 md:pb-0"
    >
      <ul className="flex gap-1 p-1 md:flex-col md:gap-2 md:p-4">
        {DESTINATIONS.map((destination) => {
          const active = isActive(pathname, destination.href);
          return (
            <li key={destination.href} className="flex-1 md:flex-none">
              <Link
                href={destination.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 text-base md:min-h-14 md:flex-row md:justify-start md:gap-4 md:px-4 md:text-xl ${
                  active
                    ? "border-kaki bg-kaki-soft font-bold text-kaki-strong"
                    : "border-transparent font-medium text-ink-soft hover:bg-kaki-soft hover:text-ink"
                }`}
              >
                {destination.icon}
                <span>{destination.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
