"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  FORMAT_LIMITS,
  SECTION_KINDS,
  SECTION_KIND_LABEL,
  formatTotalMarks,
  normalisePaperFormat,
  validatePaperFormat,
  type FormatSection,
  type PaperFormat,
  type SectionKind,
} from "@/domain/assessments";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/field";

/** A part as it is typed: numbers stay text until they are checked, so half-typed values are allowed. */
export type PartDraft = {
  label: string;
  booklet: string;
  showBooklet: boolean;
  kind: SectionKind;
  questionCount: string;
  totalMarks: string;
  /** Kept only while it still explains the marks. */
  marksEach: number | undefined;
};

export function toDraft(part: FormatSection): PartDraft {
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

export type FormatDraft = {
  parts: PartDraft[];
  setParts: Dispatch<SetStateAction<PartDraft[]>>;
  duration: string;
  setDuration: Dispatch<SetStateAction<string>>;
  /** The parts and time as they are now, tidied. */
  custom: PaperFormat;
  /** Everything the same rules the server uses find wrong with it, in a parent's words. */
  issues: ReturnType<typeof validatePaperFormat>;
  total: number;
};

/**
 * The state of the "parts of the paper" editor. `checked` turns the rule check on: the same
 * `validatePaperFormat` the server uses, so a problem shows next to the part as it is typed.
 */
export function useFormatDraft(initial: { durationMinutes: number | null; parts: FormatSection[] }, checked = true): FormatDraft {
  const [parts, setParts] = useState<PartDraft[]>(() => initial.parts.map(toDraft));
  const [duration, setDuration] = useState(initial.durationMinutes === null ? "" : String(initial.durationMinutes));
  const custom = useMemo(
    () =>
      normalisePaperFormat({
        durationMinutes: duration.trim() === "" ? Number.NaN : Number(duration),
        sections: parts.map(toSection),
      }),
    [duration, parts],
  );
  const issues = useMemo(() => (checked ? validatePaperFormat(custom) : []), [checked, custom]);
  return { parts, setParts, duration, setDuration, custom, issues, total: formatTotalMarks(custom) };
}

/**
 * The parts of a paper: each part's name, question type, number of questions and marks, and the
 * time. Used by "Match my school's paper" and by "We found this" when the parent edits the format.
 */
export function FormatPartsEditor({ draft, serverErrors = {} }: { draft: FormatDraft; serverErrors?: Record<string, string> }) {
  const { parts, setParts, duration, setDuration, issues, total } = draft;
  const partIssues = (index: number): string[] => issues.filter((issue) => issue.sectionIndex === index).map((issue) => issue.message);
  const paperIssues = issues.filter((issue) => issue.sectionIndex === undefined).map((issue) => issue.message);
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

  return (
    <>
    <ol className="flex flex-col gap-4">
      {parts.map((part, index) => {
        const messages = [...partIssues(index), ...(serverErrors[`part-${index}`] && partIssues(index).length === 0 ? [serverErrors[`part-${index}`] as string] : [])];
        const id = `part-${index}`;
        return (
          <li key={index} className="flex flex-col gap-4 rounded-control border-[1.5px] border-line bg-surface p-4">
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
              <label htmlFor={`${id}-name`} className="text-lg font-semibold text-ink">
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
                  <label htmlFor={`${id}-booklet`} className="text-lg font-semibold text-ink">
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
                <label htmlFor={`${id}-kind`} className="text-lg font-semibold text-ink">
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
                <label htmlFor={`${id}-count`} className="text-lg font-semibold text-ink">
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
                <label htmlFor={`${id}-marks`} className="text-lg font-semibold text-ink">
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
      <label htmlFor="paper-duration" className="text-lg font-semibold text-ink">
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

    </>
  );
}
