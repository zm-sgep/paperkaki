"use client";

import { useId, type ReactElement } from "react";
import { inputClassName } from "@/components/ui/field";

/**
 * The answer box for a question that is not multiple choice. The keyboard suits the answer: a
 * number pad with a decimal point for numbers, a full keyboard for fractions (they need "/") and
 * for words. When the question states a unit it sits beside the box, so the child never has to
 * type it; a dollar sign goes in front, as it is written.
 */

export type TypedAnswerKind = "number" | "fraction" | "text";

const KIND_HELP: Record<TypedAnswerKind, string | null> = {
  number: null,
  fraction: "Write it like 3/4, or 1 1/2 for a mixed number.",
  text: null,
};

export function TypedAnswer({
  kind,
  value,
  onChange,
  unit,
  label = "Your answer",
  shape = "control",
}: {
  kind: TypedAnswerKind;
  value: string;
  onChange: (text: string) => void;
  /** The unit the question states, e.g. "cm" or "$". */
  unit?: string | undefined;
  label?: string;
  /** "soft" is the rounder corner the child's practice uses; Mock Mode keeps the default. */
  shape?: "control" | "soft";
}): ReactElement {
  const id = useId();
  const help = KIND_HELP[kind];
  const unitBefore = unit === "$";
  const unitId = `${id}-unit`;
  const helpId = `${id}-help`;
  return (
    <div data-typed-answer className="flex flex-col gap-2">
      <label htmlFor={id} className="text-lg font-semibold text-ink">
        {label}
      </label>
      {help ? (
        <p id={helpId} className="text-base text-ink-soft">
          {help}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        {unit && unitBefore ? (
          <span id={unitId} className="text-2xl font-semibold text-ink">
            {unit}
          </span>
        ) : null}
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          inputMode={kind === "number" ? "decimal" : "text"}
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={kind === "text" ? 120 : 24}
          aria-describedby={[help ? helpId : null, unit ? unitId : null].filter(Boolean).join(" ") || undefined}
          className={`${inputClassName} min-h-14 max-w-xs text-2xl ${shape === "soft" ? "rounded-2xl" : ""}`.trim()}
        />
        {unit && !unitBefore ? (
          <span id={unitId} className="text-2xl font-semibold text-ink">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}
