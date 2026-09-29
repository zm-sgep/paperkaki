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
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-6 w-6 shrink-0",
} as const;

/** The four parent destinations (ADR-0007). Adding a fifth needs a new ADR, not a new line here. */
const DESTINATIONS: readonly Destination[] = [
  {
    href: "/home",
    label: "Home",
    icon: (
      <svg {...iconProps}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v10h13V10" />
      </svg>
    ),
  },
  {
    href: "/prepare",
    label: "Prepare",
    icon: (
      <svg {...iconProps}>
        <path d="M7 3h8l4 4v14H7z" />
        <path d="M15 3v4h4M10 12h6M10 16h6" />
      </svg>
    ),
  },
  {
    href: "/progress",
    label: "Progress",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
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

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One nav element: a bottom tab bar under 768px, a left sidebar from 768px up. Same four items,
 * same order. The active item has a heavier label and an indicator bar as well as its colour,
 * and `aria-current="page"`. Every target is at least 48px in both directions.
 */
export function ParentNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:top-16 md:right-auto md:w-60 md:border-r md:border-t-0 md:pb-0"
    >
      <ul className="flex md:flex-col md:gap-1 md:p-3">
        {DESTINATIONS.map((destination) => {
          const active = isActive(pathname, destination.href);
          return (
            <li key={destination.href} className="flex-1 md:flex-none">
              <Link
                href={destination.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 border-t-4 text-sm md:min-h-12 md:flex-row md:justify-start md:gap-3 md:rounded-lg md:border-l-4 md:border-t-0 md:px-3 md:text-base ${
                  active
                    ? "border-kaki bg-kaki-soft font-bold text-kaki"
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
