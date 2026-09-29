import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/application/queries/current-parent";
import { getCurriculumVersionOverview, getOutcomeWithSources } from "@/application/queries/curriculum";
import { PageHeader } from "@/components/ui/page-header";
import { PROVENANCE_LABEL, asUuid, formatDate } from "../../../labels";
import { StatusBadge, VerificationTag } from "../../../status-badge";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Curriculum outcome · PaperKaki admin" };
export const dynamic = "force-dynamic";

export default async function CurriculumOutcomePage({ params }: { params: Promise<{ versionId: string; outcomeId: string }> }) {
  await requireAdmin();
  const { versionId: rawVersion, outcomeId: rawOutcome } = await params;
  const versionId = asUuid(rawVersion);
  const outcomeId = asUuid(rawOutcome);
  if (!versionId || !outcomeId) notFound();

  const [version, outcome] = await Promise.all([
    getCurriculumVersionOverview(versionId),
    getOutcomeWithSources(versionId, outcomeId, { audience: "admin" }),
  ]);
  if (!version || !outcome) notFound();

  const hasPageReference = outcome.sources.some((source) => (source.pageOrSection ?? "").trim() !== "");
  const canVerify = version.status === "draft" && outcome.verification !== "verified";

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={`/admin/curriculum/${versionId}/topics/${outcome.topicId}`}
          className="text-base text-kaki underline underline-offset-4"
        >
          {outcome.topicTitle}
        </Link>
        <PageHeader title={outcome.statement} />
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={version.status} />
          <VerificationTag state={outcome.verification} />
          <span className="text-base text-ink-soft">
            <code>{outcome.code}</code> · {outcome.level} · children see &ldquo;{outcome.childLabel}&rdquo;
          </span>
        </div>
        {outcome.verification === "verified" ? (
          <p className="text-base text-ink-soft">Verified {formatDate(outcome.verifiedAt)} by a named admin.</p>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Sources</h2>
        {outcome.sources.length === 0 ? (
          <p className="text-lg text-danger">No source linked. This outcome cannot be published.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {outcome.sources.map((source) => (
              <li key={source.linkId} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
                <span className="text-lg font-semibold text-ink">{source.title}</span>
                <span className="text-base text-ink-soft">{source.publisher}</span>
                <span className="text-base text-ink">
                  {source.pageOrSection ? source.pageOrSection : <em>No page reference</em>}
                </span>
                <span className="text-sm text-ink-soft">
                  {PROVENANCE_LABEL[source.provenance]} · source {source.sourceVerification}
                </span>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-kaki underline underline-offset-4"
                  >
                    Open the source (external)
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Verification</h2>
        {canVerify ? (
          <VerifyForm versionId={versionId} outcomeId={outcomeId} needsPageReference={!hasPageReference} />
        ) : outcome.verification === "verified" ? (
          <p className="text-base text-ink-soft">This outcome has been checked against its source.</p>
        ) : (
          <p className="text-base text-ink-soft">
            This version is {version.status}, so its outcomes can no longer be changed. Verify outcomes in a draft, then publish it.
          </p>
        )}
      </section>
    </>
  );
}
