"use client";

import { BookOpen, ClipboardCheck, GraduationCap, NotebookPen, Shapes, UserRound } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field, inputClassName } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { createAssessmentAction, type NewAssessmentState } from "./actions";

/** A picture for each kind of assessment. Decoration: the name beside it says what it is. */
const TYPE_ICON: Record<string, ReactNode> = {
  wa1: <ClipboardCheck />,
  wa2: <ClipboardCheck />,
  wa3: <ClipboardCheck />,
  end_of_year: <GraduationCap />,
  class_test: <NotebookPen />,
  other: <Shapes />,
};

type Props = {
  kids: { id: string; nickname: string }[];
  selectedChildId: string | null;
  types: { value: string; label: string }[];
  /** Today in Singapore, "YYYY-MM-DD": the earliest date the calendar offers. */
  today: string;
};

export function NewAssessmentForm({ kids, selectedChildId, types, today }: Props) {
  const [state, formAction] = useActionState<NewAssessmentState, FormData>(createAssessmentAction, {});
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const [type, setType] = useState(values.type ?? "");
  const hasChildren = kids.length > 0;
  const initialChild = values.childId || selectedChildId || kids[0]?.id;

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      {hasChildren ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-1 text-lg font-semibold text-ink">Who is it for?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {kids.map((child) => (
              <ChoiceCard key={child.id} type="radio" name="childId" value={child.id} label={child.nickname} icon={<UserRound />} defaultChecked={child.id === initialChild} />
            ))}
          </div>
          <p className="text-base text-ink-soft">
            Someone else? Add them under Account.
          </p>
        </fieldset>
      ) : (
        <div className="flex flex-col gap-2">
          <Field id="nickname" label="Your child's name or nickname" error={errors.nickname}>
            <input
              id="nickname"
              name="nickname"
              type="text"
              autoComplete="off"
              maxLength={40}
              defaultValue={values.nickname}
              aria-invalid={errors.nickname ? true : undefined}
              aria-describedby={errors.nickname ? "nickname-error" : undefined}
              className={`${inputClassName} sm:max-w-md`}
            />
          </Field>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-lg font-semibold text-ink">Level and subject</span>
        <div className="flex items-center gap-3 rounded-control bg-kaki-soft px-4 py-3">
          <BookOpen aria-hidden="true" className="h-6 w-6 shrink-0 text-kaki-strong" />
          <p className="text-lg font-semibold text-ink">Primary 3 · Mathematics</p>
        </div>
        <p className="text-base text-ink-soft">PaperKaki covers Primary 3 Mathematics for now.</p>
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby={errors.type ? "type-error" : undefined}>
        <legend className="pb-1 text-lg font-semibold text-ink">Which assessment?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {types.map((option) => (
            <ChoiceCard
              key={option.value}
              type="radio"
              name="type"
              value={option.value}
              label={option.label}
              icon={TYPE_ICON[option.value] ?? <Shapes />}
              defaultChecked={values.type === option.value}
              onChange={() => setType(option.value)}
            />
          ))}
        </div>
        {errors.type ? (
          <p id="type-error" role="alert" className="text-base font-medium text-danger">
            {errors.type}
          </p>
        ) : null}
        {type === "other" ? (
          <Field id="customName" label="What is it called?" error={errors.customName}>
            <input
              id="customName"
              name="customName"
              type="text"
              autoComplete="off"
              maxLength={60}
              defaultValue={values.customName}
              aria-invalid={errors.customName ? true : undefined}
              aria-describedby={errors.customName ? "customName-error" : undefined}
              className={inputClassName}
            />
          </Field>
        ) : null}
      </fieldset>

      <Field id="date" label="Date of the assessment" error={errors.date}>
        <input
          id="date"
          name="date"
          type="date"
          min={today}
          defaultValue={values.date}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? "date-error" : undefined}
          className={`${inputClassName} sm:max-w-xs`}
        />
      </Field>

      {errors.form ? (
        <p role="alert" className="text-base font-medium text-danger">
          {errors.form}
        </p>
      ) : null}

      <SubmitButton variant="primary" size="lg" className="w-full sm:w-auto sm:self-start">
        Choose topics
      </SubmitButton>
    </form>
  );
}
