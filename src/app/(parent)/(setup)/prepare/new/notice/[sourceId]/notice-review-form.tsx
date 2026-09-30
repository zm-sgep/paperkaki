"use client";

import { Check } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import {
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABEL,
  durationText,
  formatAssessmentDate,
  formatTotalMarks,
  futureFormatLabel,
  joinLabels,
  partSummary,
  type AssessmentType,
} from "@/domain/assessments";
import type { NoticeReviewView } from "@/application/queries/notice-sources";
import { FormatPartsEditor, useFormatDraft } from "@/components/parent/format-parts-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field, inputClassName } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { confirmNoticeAction, deleteNoticeAction, type ConfirmNoticeState } from "./actions";

/** "Please check", beside anything the notice was not sure about. Words, not numbers. */
function PleaseCheck() {
  return (
    <Chip tone="kaya" className="ml-2 align-middle">
      Please check
    </Chip>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-5">
      <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Screen B: what was found, in plain words, with "Please check" beside what is uncertain. Everything
 * can be changed on the spot (Edit); "Looks right" makes the assessment and goes to the mock screen.
 */
export function NoticeReviewForm({ view }: { view: NoticeReviewView }) {
  const [state, formAction] = useActionState<ConfirmNoticeState, FormData>(confirmNoticeAction.bind(null, view.sourceId), {});
  const serverErrors = state.errors ?? {};
  const original = view.assessment;
  const hasFormat = view.format !== null;

  const [type, setType] = useState<AssessmentType>(original.type);
  const [customName, setCustomName] = useState(original.customName);
  const [date, setDate] = useState(original.date);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(view.topics.map((topic) => topic.code)));
  const [saveForFuture, setSaveForFuture] = useState(true);
  const draft = useFormatDraft(
    {
      durationMinutes: original.durationMinutes,
      parts: (view.format?.parts ?? []).map((part) => ({
        label: part.label,
        ...(part.booklet === "" ? {} : { booklet: part.booklet }),
        kind: part.kind,
        questionCount: part.questionCount,
        totalMarks: part.totalMarks,
      })),
    },
    hasFormat,
  );
  const formatIssues = hasFormat ? draft.issues : [];

  // Start with the fields open when something is missing or does not add up, so the way forward is in front of the parent.
  const [editing, setEditing] = useState(
    original.date === "" || original.durationMinutes === null || view.topics.length === 0 || formatIssues.length > 0,
  );
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.errors) setEditing(true);
  }

  const name = type === "other" ? customName.trim() || "Assessment" : ASSESSMENT_TYPE_LABEL[type];
  const minutes = draft.duration.trim() === "" ? null : Number(draft.duration);
  const validMinutes = minutes !== null && Number.isFinite(minutes) ? minutes : null;
  const dateText = date === "" ? "" : formatAssessmentDate(date, view.today);
  const checkType = original.check.type && type === original.type;
  const checkDate = original.check.date && date === original.date;
  const checkTime = original.check.duration && draft.duration === (original.durationMinutes === null ? "" : String(original.durationMinutes));

  const chosenTopics = view.allTopics.filter((topic) => selected.has(topic.code));
  const topicCheck = new Map(view.topics.map((topic) => [topic.code, topic.check]));
  const total = formatTotalMarks(draft.custom);
  const missing: string[] = [];
  if (date === "") missing.push("the date");
  if (validMinutes === null) missing.push("the time");
  if (chosenTopics.length === 0) missing.push("the topics");

  /** A part the notice was unsure about, until the parent changes it. */
  const partNeedsCheck = (index: number): boolean => {
    const first = view.format?.parts[index];
    const now = draft.custom.sections[index];
    if (!first || !now || !first.check) return false;
    return first.label === now.label && first.kind === now.kind && first.questionCount === now.questionCount && first.totalMarks === now.totalMarks;
  };

  const toggleTopic = (code: string, on: boolean): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });

  const future = futureFormatLabel(view.childNickname, type, name);
  const errorList = Object.entries(serverErrors).filter(([key]) => key === "form" || key === "format");

  return (
    <div className="flex flex-col gap-6">
      {view.multipleSubjects ? (
        <Notice>
          <p>We used the Mathematics part of the letter.</p>
        </Notice>
      ) : null}

      <form action={formAction} className="flex flex-col gap-6" noValidate>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="customName" value={customName} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="durationMinutes" value={draft.duration} />
        {[...selected].map((code) => (
          <input key={code} type="hidden" name="topic" value={code} />
        ))}
        {hasFormat ? <input type="hidden" name="format" value={JSON.stringify(draft.custom)} /> : null}
        <input type="hidden" name="saveForFuture" value={saveForFuture ? "true" : "false"} />

        {errorList.length > 0 ? (
          <Notice tone="alert" role="alert">
            {errorList.map(([key, message]) => (
              <p key={key} className="font-semibold text-danger">
                {message}
              </p>
            ))}
          </Notice>
        ) : null}

        {editing ? (
          <div className="flex flex-col gap-6" data-testid="notice-edit">
            <Field id="notice-type" label={<>Which assessment?{checkType ? <PleaseCheck /> : null}</>} error={serverErrors.type}>
              <select id="notice-type" value={type} onChange={(event) => setType(event.target.value as AssessmentType)} className={`${inputClassName} sm:max-w-xs`}>
                {ASSESSMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {ASSESSMENT_TYPE_LABEL[value]}
                  </option>
                ))}
              </select>
            </Field>
            {type === "other" ? (
              <Field id="notice-name" label="What is it called?" error={serverErrors.customName}>
                <input id="notice-name" type="text" value={customName} maxLength={60} onChange={(event) => setCustomName(event.target.value)} className={`${inputClassName} sm:max-w-sm`} />
              </Field>
            ) : null}
            <Field id="notice-date" label={<>Date of the assessment{checkDate ? <PleaseCheck /> : null}</>} error={serverErrors.date}>
              <input
                id="notice-date"
                type="date"
                min={view.today}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-invalid={serverErrors.date ? true : undefined}
                aria-describedby={serverErrors.date ? "notice-date-error" : undefined}
                className={`${inputClassName} sm:max-w-xs`}
              />
            </Field>

            <fieldset className="flex flex-col gap-3">
              <legend className="pb-1 text-lg font-semibold text-ink">Topics</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {view.allTopics.map((topic) => (
                  <ChoiceCard
                    key={topic.code}
                    type="checkbox"
                    name="topic-choice"
                    value={topic.code}
                    label={
                      <>
                        {topic.label}
                        {topicCheck.get(topic.code) && selected.has(topic.code) ? <PleaseCheck /> : null}
                      </>
                    }
                    checked={selected.has(topic.code)}
                    onChange={(on) => toggleTopic(topic.code, on)}
                  />
                ))}
              </div>
              {serverErrors.topics ? (
                <p role="alert" className="text-base font-medium text-danger">
                  {serverErrors.topics}
                </p>
              ) : null}
            </fieldset>

            {hasFormat ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-bold tracking-tight text-ink">Paper format{checkTime ? <PleaseCheck /> : null}</h2>
                <FormatPartsEditor draft={draft} serverErrors={serverErrors} />
              </div>
            ) : (
              <Field id="notice-time" label={<>Time in minutes{checkTime ? <PleaseCheck /> : null}</>} error={serverErrors.duration}>
                <input
                  id="notice-time"
                  type="number"
                  inputMode="numeric"
                  min={15}
                  max={120}
                  value={draft.duration}
                  onChange={(event) => draft.setDuration(event.target.value)}
                  className={`${inputClassName} sm:max-w-xs`}
                />
              </Field>
            )}
          </div>
        ) : (
          <Card className="flex flex-col gap-6">
            <p className="text-xl font-bold tracking-tight text-ink">
              {[
                <span key="name">
                  {name}
                  {checkType ? <PleaseCheck /> : null}
                </span>,
                <span key="date" className="whitespace-nowrap">
                  {dateText === "" ? "Date not found" : dateText}
                  {checkDate ? <PleaseCheck /> : null}
                </span>,
                <span key="time" className="whitespace-nowrap">
                  {validMinutes === null ? "Time not found" : durationText(validMinutes)}
                  {checkTime ? <PleaseCheck /> : null}
                </span>,
              ].flatMap((part, index) => (index === 0 ? [part] : [<span key={`dot-${index}`}> · </span>, part]))}
            </p>

            {hasFormat ? (
              <Section title="Paper format">
                <ul className="flex flex-col gap-1 text-lg text-ink">
                  {draft.custom.sections.map((part, index) => (
                    <li key={index}>
                      {partSummary(part)}
                      {partNeedsCheck(index) ? <PleaseCheck /> : null}
                    </li>
                  ))}
                </ul>
                <p className="text-lg font-semibold text-ink">{Number.isFinite(total) ? `${total} marks` : "Marks: please check"}</p>
              </Section>
            ) : null}

            <Section title="Topics">
              {chosenTopics.length === 0 ? (
                <p className="text-lg text-ink">We couldn&apos;t match any topics. Choose them under Edit.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-lg text-ink">
                  {chosenTopics.map((topic) => (
                    <li key={topic.code} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-kaki-soft text-kaki-strong">
                        <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                      </span>
                      <span>
                        {topic.label}
                        {topicCheck.get(topic.code) ? <PleaseCheck /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {view.appliesAcross ? <p className="text-base text-ink-soft">Word problems are included across topics.</p> : null}
              {view.unmatchedLabels.length > 0 ? (
                <p className="text-base text-ink">
                  We couldn&apos;t match {joinLabels(view.unmatchedLabels.map((label) => `“${label}”`))} to a topic. Choose the topics that fit under Edit.
                </p>
              ) : null}
            </Section>

            {view.notes.length > 0 ? (
              <Section title="Good to know">
                <ul className="flex list-disc flex-col gap-1 pl-5 text-lg text-ink">
                  {view.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </Card>
        )}

        {hasFormat ? (
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-lg text-ink">
            <input
              type="checkbox"
              checked={saveForFuture}
              onChange={(event) => setSaveForFuture(event.target.checked)}
              className="h-6 w-6 shrink-0 accent-kaki"
            />
            <span>{future}</span>
          </label>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SubmitButton variant="primary" size="lg" disabled={editing && formatIssues.length > 0} className="w-full sm:w-auto">
            Looks right
          </SubmitButton>
          <Button variant="secondary" onClick={() => setEditing((current) => !current)} className="w-full sm:w-auto">
            {editing ? "Done" : "Edit"}
          </Button>
        </div>
        {missing.length > 0 ? <p className="text-base text-ink-soft">{`Add ${joinLabels(missing)} under Edit before you continue.`}</p> : null}
      </form>

      <form action={deleteNoticeAction.bind(null, view.sourceId)}>
        <SubmitButton variant="quiet">Delete this file</SubmitButton>
      </form>
    </div>
  );
}
