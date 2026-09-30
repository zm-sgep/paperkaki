"use client";

import { ChevronDown, UserRound } from "lucide-react";
import { useTransition } from "react";

type Child = { id: string; nickname: string };

/**
 * Who the screens are about, as a pill. Hidden with no children, a plain name with one, and a compact
 * select with two or more. It is a selector, not a navigation item (UX rule 3).
 */
export function ChildSelector({
  options,
  selectedChildId,
  onSelect,
}: {
  options: Child[];
  selectedChildId: string | null;
  onSelect: (childId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  if (options.length === 0) return null;

  const selected = options.find((child) => child.id === selectedChildId) ?? options[0];
  if (options.length === 1) {
    return (
      <span className="inline-flex max-w-[8.5rem] items-center gap-1.5 rounded-full bg-kaki-soft px-3 py-1.5 text-base font-semibold text-kaki-strong sm:max-w-xs">
        <UserRound aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        <span className="truncate">{selected?.nickname}</span>
      </span>
    );
  }

  return (
    <span className="relative inline-flex max-w-[9.5rem] sm:max-w-xs">
      <UserRound
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-kaki-strong"
        strokeWidth={2.25}
      />
      <select
        aria-label="Child"
        value={selected?.id}
        disabled={pending}
        onChange={(event) => {
          const childId = event.currentTarget.value;
          startTransition(() => onSelect(childId));
        }}
        className="min-h-12 w-full appearance-none truncate rounded-full border-[1.5px] border-kaki/25 bg-kaki-soft pl-9 pr-9 text-base font-semibold text-kaki-strong transition-colors hover:border-kaki/50 focus-visible:border-kaki disabled:opacity-60"
      >
        {options.map((child) => (
          <option key={child.id} value={child.id}>
            {child.nickname}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kaki-strong"
        strokeWidth={2.5}
      />
    </span>
  );
}
