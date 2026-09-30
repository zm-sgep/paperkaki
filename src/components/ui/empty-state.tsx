import type { ReactNode } from "react";
import { Card } from "./card";

/**
 * An honest empty state: a small picture, what this page will hold in one sentence, and at most one
 * action. Pass a Button or ButtonLink as `action`; omit it when there is nothing to do yet. The
 * illustration is decorative (hidden from screen readers) and sits above the words on a phone.
 */
export function EmptyState({
  title,
  children,
  action,
  illustration,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
      {illustration ? (
        <div aria-hidden="true" className="shrink-0">
          {illustration}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col items-start gap-2">
        <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
        <p className="text-lg text-ink-soft">{children}</p>
        {action ? <div className="pt-3">{action}</div> : null}
      </div>
    </Card>
  );
}
