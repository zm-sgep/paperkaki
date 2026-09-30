"use client";

import { ChevronRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A tappable card for the child's lists (mistakes to fix, topics to practise, mocks): a picture tile, a
 * title, one line of detail and a chevron. The whole card is the target, at least 80px tall. The words on
 * the right are read by screen readers on every screen and shown from 640px up, so a phone shows the
 * chevron alone. Rows are secondary: only the mission card on a screen is a primary button.
 */

export type RowTone = "teal" | "kaya" | "coral";

const tiles: Record<RowTone, string> = {
  teal: "bg-kaki-soft text-kaki-strong",
  kaya: "bg-kaya-soft text-kaya-strong",
  coral: "bg-coral-soft text-coral-strong",
};

const rowClassName =
  "group flex min-h-20 w-full items-center gap-4 rounded-3xl border border-child-line bg-child-card p-4 text-left shadow-child transition-[transform,border-color] duration-150 hover:border-kaki/50 active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-kaki disabled:cursor-wait";

type RowContent = {
  icon: ReactNode;
  tone?: RowTone;
  title: ReactNode;
  detail?: ReactNode;
  /** What tapping does, in a word: "Practise", "Review mistakes". */
  action?: string;
  /** A bigger number or word on the right, such as a score. */
  value?: ReactNode;
  busy?: boolean;
};

function RowBody({ icon, tone = "teal", title, detail, action, value, busy = false }: RowContent) {
  return (
    <>
      <span aria-hidden="true" className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tiles[tone]} [&>svg]:h-7 [&>svg]:w-7`}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xl font-bold leading-snug text-ink">{title}</span>
        {detail ? <span className="text-base text-ink-soft">{detail}</span> : null}
      </span>
      {value ? <span className="shrink-0 text-2xl font-extrabold text-kaki-strong">{value}</span> : null}
      {action ? <span className="sr-only shrink-0 text-lg font-bold text-kaki-strong sm:not-sr-only">{action}</span> : null}
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kaki-soft text-kaki-strong transition-colors group-hover:bg-kaki group-hover:text-white"
      >
        {busy ? <LoaderCircle className="h-5 w-5 animate-spin" strokeWidth={2.5} /> : <ChevronRight className="h-5 w-5" strokeWidth={2.75} />}
      </span>
    </>
  );
}

/** A row that goes to another page. */
export function ChildRowLink({ href, ...content }: RowContent & { href: string }) {
  return (
    <Link href={href} className={rowClassName}>
      <RowBody {...content} />
    </Link>
  );
}

/** A row that submits the form around it (one tap starts the practice). Inside a <form>. */
export function ChildRowButton({ label, ...content }: RowContent & { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" aria-label={label} aria-busy={pending || undefined} disabled={pending} className={rowClassName}>
      <RowBody {...content} busy={pending} />
    </button>
  );
}
