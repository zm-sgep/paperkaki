import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/application/queries/current-parent";
import { getQuestionEditorOptions, listQuestionsForAdmin } from "@/application/queries/questions";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { QUESTION_STATUSES, QUESTION_STATUS_LABEL } from "@/domain/questions";
import { parseQuestionFilters, questionListHref } from "@/schemas/question-admin";
import { DIFFICULTY_LABEL, TYPE_LABEL } from "./labels";
import { QuestionStatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Question bank · PaperKaki admin" };
export const dynamic = "force-dynamic";

const selectClass = "min-h-12 w-full min-w-0 rounded-lg border-2 border-line bg-surface px-3 text-base text-ink focus-visible:border-kaki";

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { filters, page } = parseQuestionFilters(await searchParams);
  const [options, result] = await Promise.all([getQuestionEditorOptions(null), listQuestionsForAdmin(filters, page)]);
  const filtered = Object.keys(filters).length > 0;
  const filterKey = JSON.stringify(filters);
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.total, result.page * result.pageSize);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-base text-kaki underline underline-offset-4">
          Admin
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title="Question bank"
            description="Every question version. Only approved questions can be put on a paper."
          />
          <ButtonLink href="/admin/questions/new" variant="primary" className="self-start">
            New question
          </ButtonLink>
        </div>
      </div>

      {/* Keyed by the active filters so "Clear filters" resets the (uncontrolled) selects too. */}
      <form key={filterKey} method="get" action="/admin/questions" className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1 text-base font-medium text-ink">
          Level
          <select name="level" defaultValue={filters.level ?? ""} className={selectClass}>
            <option value="">All levels</option>
            {options.levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-base font-medium text-ink">
          Topic
          <select name="topic" defaultValue={filters.topicId ?? ""} className={selectClass}>
            <option value="">All topics</option>
            {options.topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-base font-medium text-ink">
          Outcome
          <select name="outcome" defaultValue={filters.outcomeId ?? ""} className={selectClass}>
            <option value="">All outcomes</option>
            {options.topics.map((topic) => (
              <optgroup key={topic.id} label={topic.title}>
                {topic.outcomes.map((outcome) => (
                  <option key={outcome.id} value={outcome.id}>
                    {outcome.code} · {outcome.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-base font-medium text-ink">
          Question type
          <select name="type" defaultValue={filters.questionType ?? ""} className={selectClass}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-base font-medium text-ink">
          Difficulty
          <select name="difficulty" defaultValue={filters.difficulty ?? ""} className={selectClass}>
            <option value="">Any difficulty</option>
            {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-base font-medium text-ink">
          Status
          <select name="status" defaultValue={filters.status ?? ""} className={selectClass}>
            <option value="">Any status</option>
            {QUESTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {QUESTION_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
          <SubmitButton variant="secondary">Filter</SubmitButton>
          {filtered ? (
            <Link href="/admin/questions" className="inline-flex min-h-12 items-center px-2 text-base text-kaki underline underline-offset-4">
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-base text-ink-soft" role="status">
        {result.total === 0 ? "No questions match." : `Showing ${from}–${to} of ${result.total} question${result.total === 1 ? "" : "s"}.`}
      </p>

      {result.total === 0 ? (
        <p className="text-lg text-ink-soft">
          {filtered ? (
            <>Try removing a filter.</>
          ) : (
            <>
              The bank is empty. Import a file with <code>npm run questions:import</code>, run <code>npm run db:seed</code> in development, or write a{" "}
              <Link href="/admin/questions/new" className="text-kaki underline underline-offset-4">
                new question
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/questions/${row.id}`}
                className="flex min-h-12 flex-col gap-2 rounded-xl border border-line bg-surface p-3 hover:border-kaki sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-lg font-semibold text-ink">{row.summary}</span>
                  <span className="text-sm text-ink-soft">
                    <code>{row.familyCode}</code> · version {row.version} · {row.topicTitle} · {row.primaryOutcomeCode} · {TYPE_LABEL[row.questionType]} ·{" "}
                    {DIFFICULTY_LABEL[row.difficulty]} · {row.marks} {row.marks === 1 ? "mark" : "marks"}
                  </span>
                </span>
                <QuestionStatusBadge status={row.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <ButtonLink href={questionListHref(filters, result.page - 1)} variant="secondary" rel="prev">
              Previous
            </ButtonLink>
          ) : (
            <span />
          )}
          <span className="text-base text-ink-soft">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <ButtonLink href={questionListHref(filters, result.page + 1)} variant="secondary" rel="next">
              Next
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
