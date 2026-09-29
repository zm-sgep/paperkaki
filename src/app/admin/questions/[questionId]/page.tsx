import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/application/queries/current-parent";
import { getQuestionForAdmin } from "@/application/queries/questions";
import { AnswerView } from "@/components/paper/AnswerView";
import { QuestionView } from "@/components/paper/QuestionView";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { asUuid } from "../../curriculum/labels";
import { ACTION_LABEL, DEMAND_LABEL, DIFFICULTY_LABEL, TYPE_LABEL, formatDateTime } from "../labels";
import { QuestionStatusBadge } from "../status-badge";
import { ReviewForm, SubmitForReviewForm } from "./review-panel";

export const metadata: Metadata = { title: "Question · PaperKaki admin" };
export const dynamic = "force-dynamic";

const ROLE_LABEL = { primary: "Main outcome", secondary: "Also covers", prerequisite: "Builds on" } as const;

const CHECK_TONE = {
  good: { title: "Answer check passed", box: "border-kaki bg-kaki-soft text-kaki-strong" },
  human: { title: "Needs your check", box: "border-amber-600 bg-amber-50 text-amber-900" },
  bad: { title: "Answer check failed", box: "border-danger bg-surface text-danger" },
} as const;

export default async function QuestionReviewPage({ params }: { params: Promise<{ questionId: string }> }) {
  await requireAdmin();
  const questionId = asUuid((await params).questionId);
  if (!questionId) notFound();
  const detail = await getQuestionForAdmin(questionId);
  if (!detail) notFound();
  const { question, draft, outcomes, verificationSummary, reviews, events, versions } = detail;
  const otherVersions = versions.filter((v) => v.id !== question.id);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/questions" className="text-base text-kaki underline underline-offset-4">
          Question bank
        </Link>
        <PageHeader
          title={question.familyTitle}
          description={
            <>
              <code>{question.familyCode}</code> · version {question.version}
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <QuestionStatusBadge status={question.status} />
          <span className="text-base text-ink-soft">
            {TYPE_LABEL[question.questionType]} · {DIFFICULTY_LABEL[question.difficulty]} · {DEMAND_LABEL[question.cognitiveDemand]} ·{" "}
            {question.marks} {question.marks === 1 ? "mark" : "marks"} · about {Math.round(question.estimatedSeconds / 60) || 1} min
          </span>
        </div>
      </div>

      {draft === null ? (
        <section role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-danger bg-surface p-4">
          <h2 className="text-xl font-semibold text-danger">This question is not valid</h2>
          <ul className="list-disc pl-5 text-base text-danger">
            {detail.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3" aria-labelledby="pupil-view">
            <h2 id="pupil-view" className="text-xl font-semibold text-ink">
              How the pupil sees it
            </h2>
            <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
              <QuestionView content={draft.content} marks={question.marks} />
            </div>
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="answer-view">
            <h2 id="answer-view" className="text-xl font-semibold text-ink">
              Answer and worked solution <span className="text-base font-normal text-ink-soft">(never shown to the pupil while they work)</span>
            </h2>
            <div className="rounded-xl border border-line bg-surface p-5">
              <AnswerView answer={draft.answer} content={draft.content} workedSolution={draft.workedSolution} />
            </div>
            {verificationSummary ? (
              <div data-verification={verificationSummary.tone} className={`flex flex-col gap-1 rounded-xl border-2 p-4 ${CHECK_TONE[verificationSummary.tone].box}`}>
                <h3 className="text-lg font-semibold">{CHECK_TONE[verificationSummary.tone].title}</h3>
                {verificationSummary.lines.map((line) => (
                  <p key={line} className="text-base">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        </>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="curriculum">
        <h2 id="curriculum" className="text-xl font-semibold text-ink">
          Curriculum outcomes
        </h2>
        <ul className="flex flex-col gap-2">
          {outcomes.map((outcome) => (
            <li key={outcome.outcomeId} className="rounded-xl border border-line bg-surface p-3">
              <span className="text-sm font-semibold text-ink-soft">{ROLE_LABEL[outcome.role]}</span>
              <p className="text-lg text-ink">
                <code>{outcome.code}</code> · {outcome.statement}
              </p>
              <p className="text-sm text-ink-soft">{outcome.topicTitle}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="decision">
        <h2 id="decision" className="text-xl font-semibold text-ink">
          {question.status === "draft" ? "Next step" : question.status === "in_review" ? "Review" : "Status"}
        </h2>
        {question.status === "draft" ? (
          <>
            <p className="text-base text-ink-soft">This is a draft. Check it, then send it for review.</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SubmitForReviewForm questionId={question.id} />
              <ButtonLink href={`/admin/questions/${question.id}/edit`} variant="secondary">
                Edit draft
              </ButtonLink>
            </div>
            <ReviewForm questionId={question.id} status={question.status} answerNeedsPerson={false} />
          </>
        ) : question.status === "in_review" ? (
          <>
            <ReviewForm
              questionId={question.id}
              status={question.status}
              answerNeedsPerson={detail.verification?.ok === true && detail.verification.needsHumanCheck === true}
            />
            <p className="text-base text-ink-soft">To change the wording or answer, choose Request changes first. A question in review cannot be edited.</p>
          </>
        ) : (
          <>
            <p className="text-base text-ink-soft">
              {question.status === "approved"
                ? "Approved questions never change, because papers refer to this exact version. To correct it, create a new version."
                : "Retired questions are never put on new papers."}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={`/admin/questions/${question.id}/edit`} variant="secondary">
                Create a corrected version
              </ButtonLink>
            </div>
            {question.status === "approved" ? <ReviewForm questionId={question.id} status={question.status} answerNeedsPerson={false} /> : null}
          </>
        )}
      </section>

      {otherVersions.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="versions">
          <h2 id="versions" className="text-xl font-semibold text-ink">
            Other versions of this question
          </h2>
          <ul className="flex flex-wrap gap-3">
            {otherVersions.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/questions/${v.id}`} className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-base text-kaki underline underline-offset-4">
                  Version {v.version} <QuestionStatusBadge status={v.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="history">
        <h2 id="history" className="text-xl font-semibold text-ink">
          History
        </h2>
        <ol data-audit-trail className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-xl border border-line bg-surface p-3">
              <p className="text-base font-semibold text-ink">{ACTION_LABEL[event.action] ?? event.action}</p>
              <p className="text-sm text-ink-soft">
                {formatDateTime(event.createdAt)} · {event.actorName ?? "System"}
              </p>
            </li>
          ))}
        </ol>
        {reviews.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-ink">Review decisions</h3>
            <ul className="flex flex-col gap-2">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-xl border border-line bg-surface p-3">
                  <p className="text-base font-semibold text-ink">
                    {review.decision === "approved" ? "Approved" : review.decision === "retired" ? "Retired" : "Changes requested"}
                    <span className="font-normal text-ink-soft">
                      {" "}
                      · {formatDateTime(review.createdAt)} · {review.reviewerName ?? "System (development seed)"}
                    </span>
                  </p>
                  {review.notes ? <p className="text-base text-ink">{review.notes}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </>
  );
}
