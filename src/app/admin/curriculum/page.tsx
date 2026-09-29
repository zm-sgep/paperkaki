import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/application/queries/current-parent";
import { listCurriculumVersionOverviews } from "@/application/queries/curriculum";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "./labels";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Curriculum · PaperKaki admin" };
export const dynamic = "force-dynamic";

export default async function CurriculumVersionsPage() {
  await requireAdmin();
  const versions = await listCurriculumVersionOverviews();

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-base text-kaki underline underline-offset-4">
          Admin
        </Link>
        <PageHeader
          title="Curriculum"
          description="Versions of the syllabus. Published versions never change; a new syllabus is a new version."
        />
      </div>

      {versions.length === 0 ? (
        <p className="text-lg text-ink-soft">
          No curriculum yet. Import a file with <code>npm run curriculum:import</code>, or run <code>npm run db:seed</code> in development.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {versions.map((version) => (
            <li key={version.id}>
              <Link
                href={`/admin/curriculum/${version.id}`}
                className="flex min-h-12 flex-col gap-2 rounded-xl border border-line bg-surface p-4 hover:border-kaki sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-ink">{version.title}</span>
                  <span className="text-sm text-ink-soft">
                    {version.subject} · {version.levels.join(", ")} · <code>{version.code}</code>
                  </span>
                  <span className="text-sm text-ink-soft">
                    Effective {formatDate(version.effectiveFrom)} · {version.topics} topics · {version.outcomes} outcomes
                    {version.unverifiedOutcomes > 0 ? ` (${version.unverifiedOutcomes} unverified)` : ""}
                  </span>
                </span>
                <StatusBadge status={version.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
