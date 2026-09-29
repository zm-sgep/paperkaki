import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/application/queries/current-parent";
import { getCurriculumTree, getCurriculumVersionOverview } from "@/application/queries/curriculum";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { asUuid, formatDate } from "../labels";
import { StatusBadge } from "../status-badge";

export const metadata: Metadata = { title: "Curriculum version · PaperKaki admin" };
export const dynamic = "force-dynamic";

const selectClass = "min-h-12 rounded-lg border-2 border-line bg-surface px-3 text-base text-ink focus-visible:border-kaki";

export default async function CurriculumVersionPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ level?: string | string[]; topic?: string | string[] }>;
}) {
  await requireAdmin();
  const versionId = asUuid((await params).versionId);
  if (!versionId) notFound();
  const version = await getCurriculumVersionOverview(versionId);
  if (!version) notFound();

  const query = await searchParams;
  const level = typeof query.level === "string" && version.levels.includes(query.level) ? query.level : undefined;
  const topicFilter = asUuid(query.topic) ?? undefined;

  // The full tree fills the topic filter; the filtered tree is what is listed.
  const [everything, shown] = await Promise.all([
    getCurriculumTree(versionId, { audience: "admin" }),
    getCurriculumTree(versionId, { audience: "admin", level, topicId: topicFilter }),
  ]);
  const topicOptions = (everything?.domains ?? []).flatMap((domain) => domain.topics);
  const filtered = level !== undefined || topicFilter !== undefined;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/curriculum" className="text-base text-kaki underline underline-offset-4">
          All curriculum versions
        </Link>
        <PageHeader title={version.title} />
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={version.status} />
          <span className="text-base text-ink-soft">
            {version.subject} · {version.levels.join(", ")} · <code>{version.code}</code> · effective {formatDate(version.effectiveFrom)}
          </span>
        </div>
        <p className="text-base text-ink-soft">
          {version.domains} domains · {version.topics} topics · {version.outcomes} outcomes
          {version.unverifiedOutcomes > 0 ? ` · ${version.unverifiedOutcomes} unverified` : " · all verified"}
          {version.publishedAt ? ` · published ${formatDate(version.publishedAt)}` : ""}
        </p>
        {version.status === "draft" ? (
          <p className="text-base text-ink-soft">Draft: not visible to families until it is published.</p>
        ) : null}
      </div>

      {/* Keyed by the active filters so "Clear filters" resets the (uncontrolled) selects too. */}
      <form key={`${level ?? ""}|${topicFilter ?? ""}`} method="get" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-base font-medium text-ink">
          Level
          <select name="level" defaultValue={level ?? ""} className={selectClass}>
            <option value="">All levels</option>
            {version.levels.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-base font-medium text-ink">
          Topic
          <select name="topic" defaultValue={topicFilter ?? ""} className={selectClass}>
            <option value="">All topics</option>
            {topicOptions.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton variant="secondary">Filter</SubmitButton>
        {filtered ? (
          <Link
            href={`/admin/curriculum/${versionId}`}
            className="inline-flex min-h-12 items-center px-2 text-base text-kaki underline underline-offset-4"
          >
            Clear filters
          </Link>
        ) : null}
      </form>

      {shown && shown.domains.length > 0 ? (
        <div className="flex flex-col gap-6">
          {shown.domains.map((domain) => (
            <section key={domain.id} className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold text-ink">
                {domain.title} <span className="text-base font-normal text-ink-soft">({domain.code})</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {domain.topics.map((topic) => {
                  const unverified = topic.outcomes.filter((outcome) => outcome.verification !== "verified").length;
                  return (
                    <li key={topic.id}>
                      <Link
                        href={`/admin/curriculum/${versionId}/topics/${topic.id}`}
                        className="flex min-h-12 flex-col gap-1 rounded-xl border border-line bg-surface p-3 hover:border-kaki sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="flex flex-col">
                          <span className="text-lg font-semibold text-ink">{topic.title}</span>
                          <span className="text-sm text-ink-soft">
                            <code>{topic.code}</code> · {topic.level} · parents see &ldquo;{topic.parentLabel}&rdquo;
                          </span>
                        </span>
                        <span className="text-sm text-ink-soft">
                          {topic.outcomes.length} outcomes{unverified > 0 ? ` · ${unverified} unverified` : " · all verified"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="text-lg text-ink-soft">No topics match these filters.</p>
      )}
    </>
  );
}
