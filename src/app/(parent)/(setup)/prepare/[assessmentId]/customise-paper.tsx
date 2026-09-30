"use client";

import { ChevronDown } from "lucide-react";
import { useActionState } from "react";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field, inputClassName } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PaperFormatSetup } from "@/application/queries/assessment-setup";
import { saveSettingsAction, type SettingsState } from "./actions";
import { PaperFormatForm } from "./paper-format-form";

type Props = {
  assessmentId: string;
  markOptions: number[];
  settings: { totalMarks: number; durationMinutes: number; difficulty: string };
  usingRecommended: boolean;
  paperFormat: PaperFormatSetup;
};

const DIFFICULTIES = [
  { value: "easier", label: "Easier" },
  { value: "balanced", label: "Balanced" },
  { value: "harder", label: "Harder" },
];

/** Collapsed by default: most parents never need it (progressive disclosure). */
export function CustomisePaper({ assessmentId, markOptions, settings, usingRecommended, paperFormat }: Props) {
  const [state, formAction] = useActionState<SettingsState, FormData>(saveSettingsAction.bind(null, assessmentId), {});
  const errors = state.errors ?? {};
  const marks = state.values?.totalMarks ?? String(settings.totalMarks);
  const minutes = state.values?.durationMinutes ?? String(settings.durationMinutes);
  const difficulty = state.values?.difficulty ?? settings.difficulty;

  return (
    <details open={state.errors ? true : undefined} className="group/details rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-lg font-semibold text-kaki-strong [&::-webkit-details-marker]:hidden">
        Customise paper
        <ChevronDown aria-hidden="true" className="h-5 w-5 text-ink-soft transition-transform group-open/details:rotate-180" strokeWidth={2.5} />
      </summary>
      <div className="mt-4 flex flex-col gap-8">
        <PaperFormatForm
          assessmentId={assessmentId}
          choices={paperFormat.choices}
          selected={paperFormat.selected}
          current={paperFormat.current}
          futureLabel={paperFormat.futureLabel}
        />
        <hr className="border-line" />
      <form key={`${settings.totalMarks}-${settings.durationMinutes}-${settings.difficulty}-${paperFormat.selected}`} action={formAction} className="flex flex-col gap-6">
        {paperFormat.marksAndTimeEditable ? (
          <>
            <Field id="totalMarks" label="Total marks" error={errors.totalMarks}>
              <select id="totalMarks" name="totalMarks" defaultValue={marks} className={`${inputClassName} sm:max-w-xs`}>
                {markOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} marks
                  </option>
                ))}
              </select>
            </Field>
            <Field id="durationMinutes" label="Time in minutes" error={errors.durationMinutes}>
              <input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                inputMode="numeric"
                min={15}
                max={120}
                defaultValue={minutes}
                aria-invalid={errors.durationMinutes ? true : undefined}
                aria-describedby={errors.durationMinutes ? "durationMinutes-error" : undefined}
                className={`${inputClassName} sm:max-w-xs`}
              />
            </Field>
          </>
        ) : (
          <p className="text-base text-ink-soft">Marks and time come from the paper format above.</p>
        )}
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-1 text-lg font-semibold text-ink">How hard?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {DIFFICULTIES.map((option) => (
              <ChoiceCard key={option.value} type="radio" name="difficulty" value={option.value} label={option.label} defaultChecked={difficulty === option.value} />
            ))}
          </div>
          {errors.difficulty ? (
            <p role="alert" className="text-base font-medium text-danger">
              {errors.difficulty}
            </p>
          ) : null}
        </fieldset>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SubmitButton variant="secondary" name="intent" value="save" className="w-full sm:w-auto">
            Save settings
          </SubmitButton>
          {usingRecommended ? null : (
            <SubmitButton variant="quiet" name="intent" value="recommended" formNoValidate className="w-full sm:w-auto">
              Use recommended settings
            </SubmitButton>
          )}
        </div>
        <p role="status" className="text-base text-ink">
          {state.saved ? "Saved. The summary above is up to date." : null}
        </p>
      </form>
      </div>
    </details>
  );
}

