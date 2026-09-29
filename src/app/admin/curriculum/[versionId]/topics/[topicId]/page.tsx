import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/application/queries/current-parent";
import { getCurriculumTree, getCurriculumVersionOverview } from "@/application/queries/curriculum";
import { PageHeader } from "@/components/ui/page-header";
import { asUuid } from "../../../labels";
import { StatusBadge, VerificationTag } from "../../../status-badge";

export const metadata: Metadata = { title: "Curriculum topic · PaperKaki admin" };
export const dynamic = "force-dynamic";

export default async function CurriculumTopicPage({ params }: { params: Promise<{ versionId: string; topicId: string }> }) {
  await requireAdmin();
  const { versionId: rawVersion, topicId: rawTopic } = await params;
  const versionId = asUuid(rawVersion);
  const topicId = asUuid(rawTopic);
  if (!versionId || !topicId) notFound();

  const [version, tree] = await Promise.all([
    getCurriculumVersionOverview(versionId),
    getCurriculumTree(versionId, { audience: "admin", topicId }),
  ]);
  const domain = tree?.domains[0];
  const topic = domain?.topics[0];
  if (!version || !domain || !topic) notFound();

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href={`/admin/curriculum/${versionId}`} className="text-base text-kaki underline underline-offset-4">
          {version.title}
        </Link>
        <PageHeader title={topic.title} />
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={version.status} />
          <span className="text-base text-ink-soft">
            {domain.title} · <code>{topic.code}</code> · {topic.level} · parents see &ldquo;{topic.parentLabel}&rdquo;
          </span>
        </div>
      </div>

      {topic.scopeNotes.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold text-ink">Scope notes (quoted from the source)</h2>
          <ul className="list-disc pl-5 text-base text-ink">
            {topic.scopeNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-ink">Outcomes</h2>
        <ul className="flex flex-col gap-2">
          {topic.outcomes.map((outcome) => (
            <li key={outcome.id}>
              <Link
                href={`/admin/curriculum/${versionId}/outcomes/${outcome.id}`}
                className="flex min-h-12 flex-col gap-1 rounded-xl border border-line bg-surface p-3 hover:border-kaki sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col">
                  <span className="text-lg text-ink">{outcome.statement}</span>
                  <span className="text-sm text-ink-soft">
                    <code>{outcome.code}</code> · children see &ldquo;{outcome.childLabel}&rdquo;
                  </span>
                </span>
                <VerificationTag state={outcome.verification} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
