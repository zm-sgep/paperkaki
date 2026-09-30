"use client";

import { Gift, PencilLine, Sprout, Sun, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Destination = { href: string; label: string; Icon: LucideIcon };

/** The four child destinations (docs/INFORMATION_ARCHITECTURE.md section 2). A fifth needs a new ADR. */
const DESTINATIONS: readonly Destination[] = [
  { href: "/today", label: "Today", Icon: Sun },
  { href: "/practice", label: "Practice", Icon: PencilLine },
  { href: "/progress", label: "Progress", Icon: Sprout },
  { href: "/rewards", label: "Rewards", Icon: Gift },
];

/** Progress and Rewards are served from /kid/... behind the same address (see proxy.ts); either counts. */
function isActive(pathname: string, href: string): boolean {
  const path = pathname.startsWith("/kid/") ? pathname.slice(4) : pathname;
  return path === href || path.startsWith(`${href}/`);
}

/**
 * One nav element: a friendly bottom bar under 768px, a left sidebar from 768px up. Same four items in
 * the same order, always with a text label. The active item sits in a solid teal pill with a heavier
 * label (so it never depends on colour alone) and `aria-current="page"`. Every target is at least 64px tall.
 */
export function ChildNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-child-line bg-child-card pb-[env(safe-area-inset-bottom)] shadow-child-bar md:top-16 md:right-auto md:w-64 md:border-r md:border-t-0 md:pb-0 md:shadow-none"
    >
      <ul className="flex gap-1 px-2 py-1.5 md:flex-col md:gap-2 md:p-4">
        {DESTINATIONS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-16 flex-col items-center justify-center gap-1 rounded-3xl text-base transition-colors md:min-h-14 md:flex-row md:justify-start md:gap-4 md:rounded-full md:px-5 md:text-xl ${
                  active ? "font-extrabold text-kaki-strong md:bg-kaki md:text-white md:shadow-button" : "font-semibold text-ink-soft hover:text-ink md:hover:bg-kaya-soft"
                }`}
              >
                <span
                  className={`flex h-9 w-16 items-center justify-center rounded-full transition-colors md:h-auto md:w-auto ${
                    active ? "bg-kaki text-white shadow-button md:bg-transparent md:shadow-none" : "group-hover:bg-kaya-soft md:group-hover:bg-transparent"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-6 w-6 shrink-0 md:h-7 md:w-7" strokeWidth={2.25} />
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
