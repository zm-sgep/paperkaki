import type { Metadata } from "next";
import Link from "next/link";
import { requireParent } from "@/application/queries/current-parent";
import { listRecentResults } from "@/application/queries/results";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Progress · PaperKaki" };
export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const parent = await requireParent();
  const results = await listRecentResults({ kind: "parent", parentProfileId: parent.parentProfileId });
  return (
    <>
      <PageHeader title="Progress" />
      {results.length === 0 ? (
        <EmptyState title="Nothing to show yet">
          After your child&apos;s first mock, you&apos;ll see what is improving and what needs work.
        </EmptyState>
      ) : (
        <Card className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-ink">Recent mocks</h2>
          <ul data-recent-results className="flex flex-col">
            {results.map((result) => (
              <li key={result.attemptId} className="border-b border-line last:border-b-0">
                <Link href={result.href} className="flex min-h-14 items-center justify-between gap-3 py-2 text-lg text-ink hover:underline">
                  <span>
                    {result.label}
                    <span className="block text-base text-ink-soft">{result.childNickname}</span>
                  </span>
                  <span className="text-xl font-semibold">{result.scoreText}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
