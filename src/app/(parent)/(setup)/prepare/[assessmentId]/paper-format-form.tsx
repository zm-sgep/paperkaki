"use client";

import { useActionState, useState } from "react";
import type { FormatSection } from "@/domain/assessments";
import { FormatPartsEditor, toDraft, useFormatDraft } from "@/components/parent/format-parts-editor";
import { ChoiceCard } from "@/components/ui/choice-card";
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

const CUSTOM = "custom";

/**
 * "Paper format": ready-made choices (the recommended one first) and "Match my school's paper".
 * The parts a parent edits are checked with the same rules the server uses, so a problem shows next
 * to the part as it is typed.
 */
export function PaperFormatForm({ assessmentId, choices, selected, current, futureLabel }: Props) {
  const [state, formAction] = useActionState<FormatState, FormData>(saveFormatAction.bind(null, assessmentId), {});
  const [choice, setChoice] = useState(selected);
  const draft = useFormatDraft(current, choice === CUSTOM);
  const { setParts, setDuration, custom, issues } = draft;
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
          <FormatPartsEditor draft={draft} serverErrors={serverErrors} />

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
