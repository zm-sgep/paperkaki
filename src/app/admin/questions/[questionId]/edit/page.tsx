import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/application/queries/current-parent";
import { getQuestionEditorOptions, getQuestionForAdmin } from "@/application/queries/questions";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { asUuid } from "../../../curriculum/labels";
import { QuestionEditor, type EditorValues } from "../../question-editor";

export const metadata: Metadata = { title: "Edit question · PaperKaki admin" };
export const dynamic = "force-dynamic";

const json = (value: unknown) => JSON.stringify(value, null, 2);

export default async function EditQuestionPage({ params }: { params: Promise<{ questionId: string }> }) {
  await requireAdmin();
  const questionId = asUuid((await params).questionId);
  if (!questionId) notFound();
  const detail = await getQuestionForAdmin(questionId);
  if (!detail) notFound();
  const { question, outcomes } = detail;
  const options = await getQuestionEditorOptions(question.curriculumVersionId);

  const back = (
    <Link href={`/admin/questions/${question.id}`} className="text-base text-kaki underline underline-offset-4">
      Back to the question
    </Link>
  );

  if (question.status === "in_review") {
    return (
      <>
        {back}
        <PageHeader title="This question is in review" description="A question in review cannot be edited. Choose Request changes on the question page, then edit the draft." />
        <ButtonLink href={`/admin/questions/${question.id}`} variant="primary" className="self-start">
          Go to the review
        </ButtonLink>
      </>
    );
  }

  const initial: EditorValues = {
    familyCode: question.familyCode,
    familyTitle: question.familyTitle,
    primaryOutcomeCode: outcomes.find((o) => o.role === "primary")?.code ?? "",
    secondaryOutcomeCodes: outcomes.filter((o) => o.role === "secondary").map((o) => o.code),
    questionType: question.questionType,
    difficulty: question.difficulty,
    cognitiveDemand: question.cognitiveDemand,
    marks: String(question.marks),
    estimatedSeconds: String(question.estimatedSeconds),
    provenance: question.provenance,
    content: json(question.content),
    answer: json(question.answer),
    verification: json(question.verification),
    workedSolution: json(question.workedSolution),
    markingScheme: json(question.markingScheme),
  };
  const editsInPlace = question.status === "draft";

  return (
    <>
      {back}
      <PageHeader
        title={editsInPlace ? "Edit draft" : "Create a corrected version"}
        description={
          editsInPlace ? (
            <>
              <code>{question.familyCode}</code> · version {question.version}. Nothing is saved until you press Save.
            </>
          ) : (
            <>
              <code>{question.familyCode}</code> version {question.version} is {question.status} and never changes. Saving creates version {(detail.versions.at(-1)?.version ?? question.version) + 1} as a new draft.
            </>
          )
        }
      />
      <QuestionEditor
        curriculumVersionId={question.curriculumVersionId}
        questionId={question.id}
        status={question.status}
        topics={options.topics}
        initial={initial}
      />
    </>
  );
}
