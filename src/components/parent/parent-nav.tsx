"use client";

import { ClipboardList, Gift, House, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Destination = { href: string; label: string; Icon: LucideIcon };

/** The four parent destinations (ADR-0007). Adding a fifth needs a new ADR, not a new line here. */
const DESTINATIONS: readonly Destination[] = [
  { href: "/home", label: "Home", Icon: House },
  { href: "/prepare", label: "Prepare", Icon: ClipboardList },
  { href: "/progress", label: "Progress", Icon: TrendingUp },
  { href: "/rewards", label: "Rewards", Icon: Gift },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One nav element: a bottom tab bar under 768px, a left sidebar from 768px up. Same four items,
 * same order. The active item sits in a pill, has a heavier label and `aria-current="page"`, so
 * it never depends on colour alone. Every target is at least 48px in both directions.
 */
export function ParentNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-bar backdrop-blur md:top-16 md:right-auto md:w-60 md:border-r md:border-t-0 md:bg-surface md:pb-0 md:shadow-none md:backdrop-blur-none"
    >
      <ul className="flex md:flex-col md:gap-1 md:p-3">
        {DESTINATIONS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-sm transition-colors md:min-h-12 md:flex-row md:justify-start md:gap-3 md:rounded-full md:px-4 md:text-base ${
                  active
                    ? "font-bold text-kaki-strong md:bg-kaki-soft"
                    : "font-medium text-ink-soft hover:text-ink md:hover:bg-paper"
                }`}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors md:h-auto md:w-auto ${
                    active ? "bg-kaki-soft md:bg-transparent" : "group-hover:bg-paper md:group-hover:bg-transparent"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-6 w-6 shrink-0" strokeWidth={2} />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
