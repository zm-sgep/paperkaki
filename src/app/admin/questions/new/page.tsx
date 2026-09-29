import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/application/queries/current-parent";
import { getQuestionEditorOptions } from "@/application/queries/questions";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { asUuid } from "../../curriculum/labels";
import { QuestionEditor, type EditorValues } from "../question-editor";

export const metadata: Metadata = { title: "New question · PaperKaki admin" };
export const dynamic = "force-dynamic";

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** A valid skeleton to edit, so writing a question starts from something that already works. */
const STARTER: EditorValues = {
  familyCode: "",
  familyTitle: "",
  primaryOutcomeCode: "",
  secondaryOutcomeCodes: [],
  questionType: "number",
  difficulty: "standard",
  cognitiveDemand: "application",
  marks: "1",
  estimatedSeconds: "60",
  provenance: "original_human",
  content: json({ stem: [{ t: "p", c: [{ t: "text", v: "Write the question here. " }, { t: "blank" }] }] }),
  answer: json({ kind: "number", value: "0" }),
  verification: json({ expression: "0" }),
  workedSolution: json([{ t: "p", c: [{ t: "text", v: "Show the steps here." }] }]),
  markingScheme: json({ method: "exact" }),
};

export default async function NewQuestionPage({ searchParams }: { searchParams: Promise<{ version?: string | string[] }> }) {
  await requireAdmin();
  const requested = asUuid((await searchParams).version);
  const options = await getQuestionEditorOptions(requested);
  if (!options.curriculumVersionId) notFound();

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/questions" className="text-base text-kaki underline underline-offset-4">
          Question bank
        </Link>
        <PageHeader title="New question" description="Start from the example, change what you need, and check the preview as you go. Nothing is saved until you press Save." />
      </div>

      {options.versions.length > 1 ? (
        <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-col gap-1 text-base font-medium text-ink">
            Curriculum version
            <select name="version" defaultValue={options.curriculumVersionId} className="min-h-12 w-full min-w-0 rounded-lg border-2 border-line bg-surface px-3 text-base text-ink focus-visible:border-kaki">
              {options.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} ({v.status})
                </option>
              ))}
            </select>
          </label>
          <SubmitButton variant="secondary">Use this version</SubmitButton>
        </form>
      ) : null}

      <QuestionEditor key={options.curriculumVersionId} curriculumVersionId={options.curriculumVersionId} topics={options.topics} initial={STARTER} />
    </>
  );
}
