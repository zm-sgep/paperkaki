"use client";

import { useTransition } from "react";

type Child = { id: string; nickname: string };

/**
 * Who the screens are about. Hidden with no children, a plain name with one, and a compact
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
    return <span className="max-w-[9rem] truncate text-lg font-medium text-ink sm:max-w-xs">{selected?.nickname}</span>;
  }

  return (
    <select
      aria-label="Child"
      value={selected?.id}
      disabled={pending}
      onChange={(event) => {
        const childId = event.currentTarget.value;
        startTransition(() => onSelect(childId));
      }}
      className="min-h-12 max-w-[9rem] truncate rounded-lg border-2 border-line bg-surface px-3 text-lg font-medium text-ink focus-visible:border-kaki sm:max-w-xs"
    >
      {options.map((child) => (
        <option key={child.id} value={child.id}>
          {child.nickname}
        </option>
      ))}
    </select>
  );
}
