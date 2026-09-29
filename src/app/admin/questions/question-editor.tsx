"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { AnswerView } from "@/components/paper/AnswerView";
import { QuestionView } from "@/components/paper/QuestionView";
import { Button } from "@/components/ui/button";
import { formatFieldIssues, fieldIssues, type FieldIssue } from "@/domain/questions/issues";
import { describeVerification, type QuestionStatus } from "@/domain/questions/lifecycle";
import { verifyQuestionAnswer } from "@/domain/questions/verify";
import {
  AnswerSchema,
  QuestionContentSchema,
  QuestionDraftSchema,
  WorkedSolutionSchema,
  type QuestionDraft,
} from "@/schemas/question-content";
import { saveQuestionAction, type QuestionActionState } from "./actions";
import { DEMAND_LABEL, DIFFICULTY_LABEL, PROVENANCE_LABEL, TYPE_LABEL } from "./labels";

export type EditorTopic = {
  id: string;
  title: string;
  outcomes: { id: string; code: string; label: string }[];
};

export type EditorValues = {
  familyCode: string;
  familyTitle: string;
  primaryOutcomeCode: string;
  secondaryOutcomeCodes: string[];
  questionType: string;
  difficulty: string;
  cognitiveDemand: string;
  marks: string;
  estimatedSeconds: string;
  provenance: string;
  content: string;
  answer: string;
  verification: string;
  workedSolution: string;
  markingScheme: string;
};

const JSON_FIELDS = ["content", "answer", "verification", "workedSolution", "markingScheme"] as const;
type JsonField = (typeof JSON_FIELDS)[number];

const inputClass = "min-h-12 w-full min-w-0 rounded-lg border-2 border-line bg-surface px-3 text-base text-ink focus-visible:border-kaki";
const areaClass = "w-full min-w-0 rounded-lg border-2 border-line bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-ink focus-visible:border-kaki";

function Field({ id, label, help, errors, children }: { id: string; label: string; help?: string; errors?: string[]; children: ReactNode }) {
  const invalid = errors !== undefined && errors.length > 0;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-field={id}>
      <label htmlFor={id} className="text-base font-medium text-ink">
        {label}
      </label>
      {children}
      {help ? (
        <p id={`${id}-help`} className="text-sm text-ink-soft">
          {help}
        </p>
      ) : null}
      <div id={`${id}-errors`} aria-live="polite">
        {invalid ? (
          <ul className="list-disc pl-5 text-sm font-medium text-danger">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** Issues whose path starts with `field`, with that prefix removed so they read naturally under the field. */
function issuesFor(issues: FieldIssue[], field: string): string[] {
  return issues
    .filter((issue) => issue.path === field || issue.path.startsWith(`${field}.`) || issue.path.startsWith(`${field}[`))
    .map((issue) => {
      const rest = issue.path.slice(field.length).replace(/^\./, "");
      return rest === "" ? issue.message : `${rest}: ${issue.message}`;
    });
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, message: `Not valid JSON: ${error instanceof Error ? error.message : "syntax error"}` };
  }
}

/** The editor. Validates as you type with the same schema the server uses; the server checks again on Save. */
export function QuestionEditor({
  curriculumVersionId,
  questionId,
  status,
  topics,
  initial,
}: {
  curriculumVersionId: string;
  questionId?: string;
  status?: QuestionStatus;
  topics: EditorTopic[];
  initial: EditorValues;
}) {
  const [values, setValues] = useState<EditorValues>(initial);
  const [state, action] = useActionState<QuestionActionState, FormData>(saveQuestionAction, {});
  const set = <K extends keyof EditorValues>(key: K, value: EditorValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const analysis = useMemo(() => {
    const parsedJson = Object.fromEntries(JSON_FIELDS.map((f) => [f, parseJson(values[f])])) as Record<
      JsonField,
      ReturnType<typeof parseJson>
    >;
    const jsonErrors: Partial<Record<JsonField, string[]>> = {};
    for (const f of JSON_FIELDS) {
      const p = parsedJson[f];
      if (!p.ok) jsonErrors[f] = [p.message];
    }
    const valueOf = (f: JsonField) => {
      const p = parsedJson[f];
      return p.ok ? p.value : undefined;
    };
    const asNumber = (text: string) => (text.trim() === "" ? undefined : Number(text));
    const candidate = {
      familyCode: values.familyCode.trim(),
      familyTitle: values.familyTitle.trim(),
      primaryOutcomeCode: values.primaryOutcomeCode,
      secondaryOutcomeCodes: values.secondaryOutcomeCodes,
      questionType: values.questionType,
      difficulty: values.difficulty,
      cognitiveDemand: values.cognitiveDemand,
      marks: asNumber(values.marks),
      estimatedSeconds: asNumber(values.estimatedSeconds),
      provenance: values.provenance,
      content: valueOf("content"),
      answer: valueOf("answer"),
      verification: valueOf("verification"),
      workedSolution: valueOf("workedSolution"),
      markingScheme: valueOf("markingScheme"),
    };
    const parsed = QuestionDraftSchema.safeParse(candidate);
    const issues = parsed.success ? [] : fieldIssues(parsed.error).filter((i) => !(i.path.split(/[.[]/)[0] as JsonField in jsonErrors));
    const draft: QuestionDraft | null = parsed.success ? parsed.data : null;

    const content = QuestionContentSchema.safeParse(candidate.content);
    const answer = AnswerSchema.safeParse(candidate.answer);
    const solution = WorkedSolutionSchema.safeParse(candidate.workedSolution);
    const verdict = draft ? describeVerification(verifyQuestionAnswer(draft)) : null;
    const valid = draft !== null && Object.keys(jsonErrors).length === 0;
    return { jsonErrors, issues, draft, valid, content, answer, solution, verdict };
  }, [values]);

  const unmapped = analysis.issues.filter(
    (i) => !["familyCode", "familyTitle", "primaryOutcomeCode", "secondaryOutcomeCodes", "questionType", "difficulty", "cognitiveDemand", "marks", "estimatedSeconds", "provenance", ...JSON_FIELDS].includes(i.path.split(/[.[]/)[0] ?? ""),
  );
  const saveLabel = questionId === undefined ? "Save draft" : status === "draft" ? "Save changes" : "Save as new version";
  const fieldErrors = (field: string) => issuesFor(analysis.issues, field);

  return (
    <form action={action} className="grid grid-cols-1 gap-8 lg:grid-cols-2" noValidate>
      <input type="hidden" name="curriculumVersionId" value={curriculumVersionId} />
      {questionId ? <input type="hidden" name="questionId" value={questionId} /> : null}

      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="familyCode" label="Family code" help="Groups versions of one idea, e.g. P3-NA-FR-F01." errors={fieldErrors("familyCode")}>
            <input id="familyCode" name="familyCode" className={inputClass} value={values.familyCode} readOnly={questionId !== undefined} onChange={(e) => set("familyCode", e.target.value)} />
          </Field>
          <Field id="familyTitle" label="Family title" errors={fieldErrors("familyTitle")}>
            <input id="familyTitle" name="familyTitle" className={inputClass} value={values.familyTitle} onChange={(e) => set("familyTitle", e.target.value)} />
          </Field>
        </div>

        <Field id="primaryOutcomeCode" label="Main curriculum outcome" errors={fieldErrors("primaryOutcomeCode")}>
          <select id="primaryOutcomeCode" name="primaryOutcomeCode" className={inputClass} value={values.primaryOutcomeCode} onChange={(e) => set("primaryOutcomeCode", e.target.value)}>
            <option value="">Choose an outcome</option>
            {topics.map((topic) => (
              <optgroup key={topic.id} label={topic.title}>
                {topic.outcomes.map((outcome) => (
                  <option key={outcome.id} value={outcome.code}>
                    {outcome.code} · {outcome.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <details className="rounded-xl border border-line bg-surface p-3">
          <summary className="flex min-h-12 cursor-pointer items-center text-base font-medium text-ink">
            Other outcomes this question also covers (optional)
            {values.secondaryOutcomeCodes.length > 0 ? `: ${values.secondaryOutcomeCodes.length} chosen` : ""}
          </summary>
          <div className="mt-2 flex flex-col gap-4">
            {topics.map((topic) => (
              <fieldset key={topic.id} className="flex flex-col gap-1">
                <legend className="text-sm font-semibold text-ink-soft">{topic.title}</legend>
                {topic.outcomes.map((outcome) => (
                  <label key={outcome.id} className="flex min-h-12 items-center gap-3 text-base text-ink">
                    <input
                      type="checkbox"
                      name="secondaryOutcomeCodes"
                      value={outcome.code}
                      className="h-6 w-6 accent-kaki"
                      checked={values.secondaryOutcomeCodes.includes(outcome.code)}
                      onChange={(e) =>
                        set(
                          "secondaryOutcomeCodes",
                          e.target.checked
                            ? [...values.secondaryOutcomeCodes, outcome.code]
                            : values.secondaryOutcomeCodes.filter((c) => c !== outcome.code),
                        )
                      }
                    />
                    <span>
                      {outcome.code} · {outcome.label}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          {fieldErrors("secondaryOutcomeCodes").length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-sm font-medium text-danger">
              {fieldErrors("secondaryOutcomeCodes").map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </details>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="questionType" label="Question type" errors={fieldErrors("questionType")}>
            <select id="questionType" name="questionType" className={inputClass} value={values.questionType} onChange={(e) => set("questionType", e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field id="difficulty" label="Difficulty" errors={fieldErrors("difficulty")}>
            <select id="difficulty" name="difficulty" className={inputClass} value={values.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
              {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field id="marks" label="Marks" errors={fieldErrors("marks")}>
            <input id="marks" name="marks" type="number" inputMode="numeric" min={1} max={5} className={inputClass} value={values.marks} onChange={(e) => set("marks", e.target.value)} />
          </Field>
          <Field id="estimatedSeconds" label="Time to answer (seconds)" errors={fieldErrors("estimatedSeconds")}>
            <input id="estimatedSeconds" name="estimatedSeconds" type="number" inputMode="numeric" min={15} max={900} className={inputClass} value={values.estimatedSeconds} onChange={(e) => set("estimatedSeconds", e.target.value)} />
          </Field>
        </div>

        <details className="rounded-xl border border-line bg-surface p-3">
          <summary className="flex min-h-12 cursor-pointer items-center text-base font-medium text-ink">More settings</summary>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field id="cognitiveDemand" label="Thinking skill" errors={fieldErrors("cognitiveDemand")}>
              <select id="cognitiveDemand" name="cognitiveDemand" className={inputClass} value={values.cognitiveDemand} onChange={(e) => set("cognitiveDemand", e.target.value)}>
                {Object.entries(DEMAND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="provenance" label="Where the question came from" errors={fieldErrors("provenance")}>
              <select id="provenance" name="provenance" className={inputClass} value={values.provenance} onChange={(e) => set("provenance", e.target.value)}>
                {Object.entries(PROVENANCE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </details>

        <Field id="content" label="Question content (JSON)" help="stem: blocks such as paragraphs, tables and diagrams. Multiple choice also needs options A to D." errors={[...(analysis.jsonErrors.content ?? []), ...fieldErrors("content")]}>
          <textarea id="content" name="content" rows={12} spellCheck={false} className={areaClass} value={values.content} onChange={(e) => set("content", e.target.value)} aria-describedby="content-help content-errors" />
        </Field>
        <Field id="answer" label="Answer (JSON)" errors={[...(analysis.jsonErrors.answer ?? []), ...fieldErrors("answer")]}>
          <textarea id="answer" name="answer" rows={4} spellCheck={false} className={areaClass} value={values.answer} onChange={(e) => set("answer", e.target.value)} aria-describedby="answer-errors" />
        </Field>
        <Field id="verification" label="Answer check (JSON)" help='An expression the computer works out to confirm the answer, e.g. {"expression":"12.50+3.25"}, or {"human":true} when only a person can check it.' errors={[...(analysis.jsonErrors.verification ?? []), ...fieldErrors("verification")]}>
          <textarea id="verification" name="verification" rows={3} spellCheck={false} className={areaClass} value={values.verification} onChange={(e) => set("verification", e.target.value)} aria-describedby="verification-help verification-errors" />
        </Field>
        <Field id="workedSolution" label="Worked solution (JSON)" errors={[...(analysis.jsonErrors.workedSolution ?? []), ...fieldErrors("workedSolution")]}>
          <textarea id="workedSolution" name="workedSolution" rows={8} spellCheck={false} className={areaClass} value={values.workedSolution} onChange={(e) => set("workedSolution", e.target.value)} aria-describedby="workedSolution-errors" />
        </Field>
        <Field id="markingScheme" label="Marking scheme (JSON)" errors={[...(analysis.jsonErrors.markingScheme ?? []), ...fieldErrors("markingScheme")]}>
          <textarea id="markingScheme" name="markingScheme" rows={3} spellCheck={false} className={areaClass} value={values.markingScheme} onChange={(e) => set("markingScheme", e.target.value)} aria-describedby="markingScheme-errors" />
        </Field>

        {unmapped.length > 0 ? (
          <ul className="list-disc pl-5 text-sm font-medium text-danger" data-general-issues>
            {formatFieldIssues(unmapped).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}

        {state.error ? (
          <div role="alert" className="flex flex-col gap-1 rounded-lg border-2 border-danger bg-surface p-3">
            <p className="text-base font-semibold text-danger">{state.error}</p>
            {state.issues && state.issues.length > 0 ? (
              <ul className="list-disc pl-5 text-base text-danger">
                {state.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="primary" disabled={!analysis.valid} className="self-start">
            {saveLabel}
          </Button>
          {!analysis.valid ? (
            <p className="text-sm text-ink-soft" role="status">
              Fix the problems marked above to save.
            </p>
          ) : status !== undefined && status !== "draft" ? (
            <p className="text-sm text-ink-soft">The current version stays as it is. Saving creates a new draft version.</p>
          ) : null}
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-4 lg:self-start" aria-label="Preview">
        <section className="flex flex-col gap-2" aria-labelledby="preview-pupil">
          <h2 id="preview-pupil" className="text-xl font-semibold text-ink">
            How the pupil sees it
          </h2>
          <div className="rounded-xl border border-line bg-white p-5 shadow-sm" data-preview="pupil">
            {analysis.content.success ? (
              <QuestionView content={analysis.content.data} marks={analysis.draft?.marks} />
            ) : (
              <p className="text-base text-ink-soft">The preview appears when the question content is valid.</p>
            )}
          </div>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="preview-answer">
          <h2 id="preview-answer" className="text-xl font-semibold text-ink">
            Answer and solution <span className="text-base font-normal text-ink-soft">(not shown to the pupil)</span>
          </h2>
          <div className="rounded-xl border border-line bg-surface p-5" data-preview="answer">
            {analysis.content.success && analysis.answer.success && analysis.solution.success ? (
              <AnswerView answer={analysis.answer.data} content={analysis.content.data} workedSolution={analysis.solution.data} />
            ) : (
              <p className="text-base text-ink-soft">The answer preview appears when the content, answer and worked solution are valid.</p>
            )}
          </div>
          {analysis.verdict ? (
            <p role="status" data-verification={analysis.verdict.tone} className="text-base text-ink">
              <span className="font-semibold">{analysis.verdict.tone === "good" ? "Answer check passed. " : analysis.verdict.tone === "human" ? "Needs a person to check. " : "Answer check failed. "}</span>
              {analysis.verdict.lines.join(" ")}
            </p>
          ) : null}
        </section>
      </aside>
    </form>
  );
}
