"use client";

import type { ReactElement } from "react";
import { ChoiceCard } from "@/components/ui/choice-card";
import { InlineRunView } from "@/components/paper/QuestionView";
import type { Inline } from "@/schemas/question-content";
import type { OptionId } from "./attempt-state";

/**
 * Multiple choice as large tappable cards numbered (1) to (4), the way the printed paper numbers
 * them. The chosen card shows a tick, a heavier border and a tint (never colour alone), and the
 * choice can be changed at any time or cleared. The paper never says which card is right.
 */

export type McqOption = { id: OptionId; c: readonly Inline[] };

export function McqAnswer({
  questionId,
  options,
  value,
  onChange,
  shape = "control",
}: {
  questionId: string;
  options: readonly McqOption[];
  value: OptionId | undefined;
  onChange: (option: OptionId | null) => void;
  /** "soft" is the rounder corner the child's practice uses; Mock Mode keeps the default. */
  shape?: "control" | "soft";
}): ReactElement {
  return (
    <fieldset data-mcq className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 text-lg font-semibold text-ink">Choose one answer</legend>
      {options.map((option, index) => (
        <ChoiceCard
          key={option.id}
          type="radio"
          name={`mcq-${questionId}`}
          value={option.id}
          shape={shape}
          checked={value === option.id}
          onChange={(checked) => {
            if (checked) onChange(option.id);
          }}
          label={
            <span className="flex items-baseline gap-3 text-xl">
              <span className="min-w-8 font-semibold">({index + 1})</span>
              <span>
                <InlineRunView inlines={option.c} />
              </span>
            </span>
          }
        />
      ))}
      {value !== undefined ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex min-h-12 items-center self-start rounded-lg px-3 text-base font-semibold text-kaki-strong underline underline-offset-4 hover:bg-kaki-soft"
        >
          Clear my choice
        </button>
      ) : null}
    </fieldset>
  );
}
