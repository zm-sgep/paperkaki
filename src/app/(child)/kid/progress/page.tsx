import type { Metadata } from "next";
import Link from "next/link";
import { requireChild } from "@/application/queries/current-child";
import { listRecentResults } from "@/application/queries/results";
import { ChildCard, ChildEmptyState } from "@/components/child/child-card";

export const metadata: Metadata = { title: "Progress · PaperKaki" };
export const dynamic = "force-dynamic";

/** Served at /progress for a child device (see proxy.ts). */
export default async function ChildProgressPage() {
  const child = await requireChild();
  const results = await listRecentResults({ kind: "child", childId: child.childId });
  if (results.length === 0) {
    return <ChildEmptyState title="Progress">Your progress will show here after your first mock.</ChildEmptyState>;
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Progress</h1>
      <ChildCard className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-ink">Your mocks</h2>
        <ul className="flex flex-col">
          {results.map((result) => (
            <li key={result.attemptId} className="border-b-2 border-child-line last:border-b-0">
              <Link href={result.href} className="flex min-h-16 items-center justify-between gap-3 py-2 text-xl text-ink hover:underline">
                <span>{result.label}</span>
                <span className="text-2xl font-semibold">{result.scoreText}</span>
              </Link>
            </li>
          ))}
        </ul>
      </ChildCard>
    </div>
  );
}
