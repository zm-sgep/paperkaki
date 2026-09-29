import type { ReactNode } from "react";
import { Card } from "./card";

/**
 * An honest empty state: what this page will hold, in one sentence, and at most one action.
 * Pass a Button or ButtonLink as `action`; omit it when there is nothing to do yet.
 */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-3">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="text-lg text-ink-soft">{children}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </Card>
  );
}
