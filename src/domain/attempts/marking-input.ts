import { parseNumberText } from "@/domain/marking/parse-number";
import type { MarkingResponse } from "@/domain/marking/types";
import type { OptionId } from "@/schemas/question-content";

/** What was saved for one question when the paper is handed in. */
export type SavedAnswer = {
  selectedOption: string | null;
  typedAnswer: string | null;
  /** The unit that stood beside the answer box, if the question states one. */
  typedUnit: string | null;
  hasStrokes: boolean;
};

const OPTIONS: readonly string[] = ["A", "B", "C", "D"];

/**
 * Turns a saved answer into what `markQuestion` takes. The unit beside the box counts as written
 * only when the child typed a bare number: if they typed a unit of their own ("340 cm", "1 m 20 cm")
 * the typed text speaks for itself and is marked as typed.
 */
export function markingResponseFor(saved: SavedAnswer | undefined): MarkingResponse {
  if (!saved) return {};
  const typed = saved.typedAnswer?.trim() ? saved.typedAnswer : undefined;
  let typedUnit: string | undefined;
  if (typed && saved.typedUnit) {
    const parsed = parseNumberText(typed);
    if (parsed.ok && parsed.segments.every((segment) => segment.unit === undefined)) typedUnit = saved.typedUnit;
  }
  const selected = saved.selectedOption && OPTIONS.includes(saved.selectedOption) ? (saved.selectedOption as OptionId) : undefined;
  return { selectedOption: selected, typedAnswer: typed, typedUnit, hasHandwriting: saved.hasStrokes };
}
