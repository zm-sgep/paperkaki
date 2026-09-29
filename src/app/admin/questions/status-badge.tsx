import { QUESTION_STATUS_LABEL, type QuestionStatus } from "@/domain/questions";

const styles: Record<QuestionStatus, string> = {
  draft: "border-amber-600 bg-amber-50 text-amber-900",
  in_review: "border-sky-700 bg-sky-50 text-sky-900",
  approved: "border-kaki bg-kaki-soft text-kaki-strong",
  retired: "border-line bg-paper text-ink-soft",
};

/** The question's status as a word, never colour alone. */
export function QuestionStatusBadge({ status }: { status: QuestionStatus }) {
  return (
    <span
      data-status={status}
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold ${styles[status]}`}
    >
      {QUESTION_STATUS_LABEL[status]}
    </span>
  );
}
