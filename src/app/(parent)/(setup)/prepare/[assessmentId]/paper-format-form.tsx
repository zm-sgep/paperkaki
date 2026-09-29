"use client";

import { useActionState, useMemo, useState } from "react";
import {
  FORMAT_LIMITS,
  SECTION_KINDS,
  SECTION_KIND_LABEL,
  formatTotalMarks,
  normalisePaperFormat,
  validatePaperFormat,
  type FormatSection,
  type SectionKind,
} from "@/domain/assessments";
import { ChoiceCard } from "@/components/ui/choice-card";
import { inputClassName } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveFormatAction, type FormatState } from "./actions";

export type FormatChoiceView = {
  id: string;
  title: string;
  hint: string;
  recommended: boolean;
};

type Props = {
  assessmentId: string;
  choices: FormatChoiceView[];
  /** The id of the choice in force, or "custom". */
  selected: string;
  /** The parts and time in force, to start "Match my school's paper" from. */
  current: { durationMinutes: number; parts: FormatSection[] };
  /** "Use this format for Darius's future WA2 papers" */
  futureLabel: string;
};

/** A part as it is typed: numbers stay text until they are checked, so half-typed values are allowed. */
type PartDraft = {
  label: string;
  booklet: string;
  showBooklet: boolean;
  kind: SectionKind;
  questionCount: string;
  totalMarks: string;
  /** Kept only while it still explains the marks. */
  marksEach: number | undefined;
};

const CUSTOM = "custom";

function toDraft(part: FormatSection): PartDraft {
  return {
    label: part.label,
    booklet: part.booklet ?? "",
    showBooklet: (part.booklet ?? "") !== "",
    kind: part.kind,
    questionCount: String(part.questionCount),
    totalMarks: String(part.totalMarks),
    marksEach: part.marksEach,
  };
}

function toSection(draft: PartDraft): FormatSection {
  return {
    label: draft.label,
    ...(draft.booklet.trim() === "" ? {} : { booklet: draft.booklet }),
    kind: draft.kind,
    questionCount: draft.questionCount.trim() === "" ? Number.NaN : Number(draft.questionCount),
    totalMarks: draft.totalMarks.trim() === "" ? Number.NaN : Number(draft.totalMarks),
    ...(draft.marksEach === undefined ? {} : { marksEach: draft.marksEach }),
  };
}

const NEXT_LETTERS = "ABCDEFGH";

/**
 * "Paper format": ready-made choices (the recommended one first) and "Match my school's paper".
 * The parts a parent edits are checked with the same rules the server uses, so a problem shows next
 * to the part as it is typed.
 */
export function PaperFormatForm({ assessmentId, choices, selected, current, futureLabel }: Props) {
  const [state, formAction] = useActionState<FormatState, FormData>(saveFormatAction.bind(null, assessmentId), {});
  const [choice, setChoice] = useState(selected);
  const [duration, setDuration] = useState(String(current.durationMinutes));
  const [parts, setParts] = useState<PartDraft[]>(() => current.parts.map(toDraft));
  const [saveForFuture, setSaveForFuture] = useState(true);

  // When the paper changes on the server (saved here, or reset from the settings below), start again from it.
  const inForce = `${selected}|${JSON.stringify(current)}`;
  const [seen, setSeen] = useState(inForce);
  if (seen !== inForce) {
    setSeen(inForce);
    setChoice(selected);
    setDuration(String(current.durationMinutes));
    setParts(current.parts.map(toDraft));
  }

  const custom = useMemo(
    () =>
      normalisePaperFormat({
        durationMinutes: duration.trim() === "" ? Number.NaN : Number(duration),
        sections: parts.map(toSection),
      }),
    [duration, parts],
  );
  const issues = useMemo(() => (choice === CUSTOM ? validatePaperFormat(custom) : []), [choice, custom]);
  const partIssues = (index: number): string[] => issues.filter((issue) => issue.sectionIndex === index).map((issue) => issue.message);
  const paperIssues = issues.filter((issue) => issue.sectionIndex === undefined).map((issue) => issue.message);
  const total = formatTotalMarks(custom);
  const totalText = Number.isFinite(total) ? `Total: ${total} marks` : "Total: check the marks below";

  const update = (index: number, change: Partial<PartDraft>): void =>
    setParts((all) => all.map((part, i) => (i === index ? { ...part, ...change } : part)));

  const addPart = (): void =>
    setParts((all) => [
      ...all,
      {
        label: `Section ${NEXT_LETTERS[all.length] ?? all.length + 1}`,
        booklet: "",
        showBooklet: false,
        kind: "short",
        questionCount: "5",
        totalMarks: "5",
        marksEach: undefined,
      },
    ]);

  const removePart = (index: number): void => setParts((all) => all.filter((_, i) => i !== index));

  const serverErrors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="pb-1 text-lg font-medium text-ink">Paper format</legend>
        <div className="grid gap-3">
          {choices.map((option) => (
            <ChoiceCard
              key={option.id}
              type="radio"
              name="choice"
              value={option.id}
              checked={choice === option.id}
              onChange={() => setChoice(option.id)}
              label={
                <>
                  {option.title}{" "}
                  {option.recommended ? (
                    <span className="rounded-md bg-kaki px-2 py-0.5 text-sm font-semibold text-white">Recommended</span>
                  ) : null}
                </>
              }
              hint={option.hint}
            />
          ))}
          <ChoiceCard
            type="radio"
            name="choice"
            value={CUSTOM}
            checked={choice === CUSTOM}
            onChange={() => setChoice(CUSTOM)}
            label="Match my school's paper"
            hint="Use your school's own names, number of questions and marks."
          />
        </div>
        {serverErrors.format ? (
          <p role="alert" className="text-base font-medium text-danger">
            {serverErrors.format}
          </p>
        ) : null}
      </fieldset>

      {choice === CUSTOM ? (
        <div className="flex flex-col gap-5" data-testid="custom-format">
          <input type="hidden" name="customFormat" value={JSON.stringify(custom)} />
          <ol className="flex flex-col gap-4">
            {parts.map((part, index) => {
              const messages = [...partIssues(index), ...(serverErrors[`part-${index}`] && partIssues(index).length === 0 ? [serverErrors[`part-${index}`] as string] : [])];
              const id = `part-${index}`;
              return (
                <li key={index} className="flex flex-col gap-4 rounded-xl border-2 border-line bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-ink">{`Part ${index + 1}`}</h3>
                    <Button
                      variant="quiet"
                      disabled={parts.length <= 1}
                      onClick={() => removePart(index)}
                      aria-label={`Remove part ${index + 1}`}
                    >
                      Remove part
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor={`${id}-name`} className="text-lg font-medium text-ink">
                      Name of this part
                    </label>
                    <input
                      id={`${id}-name`}
                      type="text"
                      value={part.label}
                      maxLength={FORMAT_LIMITS.maxLabelLength + 10}
                      onChange={(event) => update(index, { label: event.target.value })}
                      className={`${inputClassName} sm:max-w-sm`}
                      aria-invalid={messages.length > 0 ? true : undefined}
                    />
                    {part.showBooklet ? (
                      <div className="flex flex-col gap-2">
                        <label htmlFor={`${id}-booklet`} className="text-lg font-medium text-ink">
                          Booklet name
                        </label>
                        <input
                          id={`${id}-booklet`}
                          type="text"
                          value={part.booklet}
                          maxLength={FORMAT_LIMITS.maxLabelLength + 10}
                          onChange={(event) => update(index, { booklet: event.target.value })}
                          className={`${inputClassName} sm:max-w-sm`}
                          placeholder="Booklet A"
                        />
                      </div>
                    ) : (
                      <div>
                        <Button variant="quiet" onClick={() => update(index, { showBooklet: true })}>
                          Add booklet name
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`${id}-kind`} className="text-lg font-medium text-ink">
                        Question type
                      </label>
                      <select
                        id={`${id}-kind`}
                        value={part.kind}
                        onChange={(event) => update(index, { kind: event.target.value as SectionKind, marksEach: undefined })}
                        className={inputClassName}
                      >
                        {SECTION_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {SECTION_KIND_LABEL[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`${id}-count`} className="text-lg font-medium text-ink">
                        Number of questions
                      </label>
                      <input
                        id={`${id}-count`}
                        type="number"
                        inputMode="numeric"
                        min={FORMAT_LIMITS.minQuestions}
                        max={FORMAT_LIMITS.maxQuestions}
                        value={part.questionCount}
                        onChange={(event) => update(index, { questionCount: event.target.value })}
                        className={inputClassName}
                        aria-invalid={messages.length > 0 ? true : undefined}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`${id}-marks`} className="text-lg font-medium text-ink">
                        Total marks
                      </label>
                      <input
                        id={`${id}-marks`}
                        type="number"
                        inputMode="numeric"
                        min={FORMAT_LIMITS.minSectionMarks}
                        max={FORMAT_LIMITS.maxSectionMarks}
                        value={part.totalMarks}
                        onChange={(event) => update(index, { totalMarks: event.target.value })}
                        className={inputClassName}
                        aria-invalid={messages.length > 0 ? true : undefined}
                      />
                    </div>
                  </div>

                  {messages.length > 0 ? (
                    <ul role="alert" className="flex flex-col gap-1 text-base font-medium text-danger">
                      {messages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div>
            <Button variant="secondary" disabled={parts.length >= FORMAT_LIMITS.maxSections} onClick={addPart}>
              Add part
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="paper-duration" className="text-lg font-medium text-ink">
              Time in minutes
            </label>
            <input
              id="paper-duration"
              type="number"
              inputMode="numeric"
              min={15}
              max={120}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className={`${inputClassName} sm:max-w-xs`}
            />
          </div>

          <p role="status" className="text-xl font-semibold text-ink">
            {totalText}
          </p>
          {paperIssues.length > 0 ? (
            <ul role="alert" className="flex flex-col gap-1 text-base font-medium text-danger">
              {paperIssues.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-lg text-ink">
            <input
              type="checkbox"
              name="saveForFuture"
              checked={saveForFuture}
              onChange={(event) => setSaveForFuture(event.target.checked)}
              className="h-6 w-6 shrink-0 accent-kaki"
            />
            <span>{futureLabel}</span>
          </label>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton variant="secondary" disabled={choice === CUSTOM && issues.length > 0} className="w-full sm:w-auto">
          Save paper format
        </SubmitButton>
      </div>
      <p role="status" className="text-base text-ink">
        {state.saved ? "Saved. The summary above is up to date." : null}
      </p>
    </form>
  );
}
