import { Check } from "lucide-react";
import { MASTERY_STATE_WORDS } from "@/domain/mastery";
import type { MasteryState } from "@/domain/mastery/types";
import { Chip, type ChipTone } from "@/components/ui/chip";

/** The chip's tint for each state: a calm ramp from grey to teal. The word is always written, so the tint only supports it. */
const TONE: Record<MasteryState, ChipTone> = {
  not_started: "neutral",
  learning: "kaya",
  developing: "kaya",
  almost_mastered: "teal",
  mastered: "teal",
  retained: "teal",
};

/** A state seen from its word ("Getting there"), for the places that only carry the word. */
function stateOfWord(word: string): MasteryState | undefined {
  return (Object.keys(MASTERY_STATE_WORDS) as MasteryState[]).find((state) => MASTERY_STATE_WORDS[state] === word);
}

/**
 * A topic's or skill's state as a small chip: "Learning", "Getting there", "Secure". Pass the `state` when the page has it,
 * or only the `word`. `marker` puts `data-state-word` on the word, for pages that list them.
 */
export function StateChip({ state, word, marker = false }: { state?: MasteryState | undefined; word: string; marker?: boolean }) {
  const resolved = state ?? stateOfWord(word);
  const tone = resolved ? TONE[resolved] : "neutral";
  const done = resolved === "mastered" || resolved === "retained";
  return (
    <Chip tone={tone} icon={done ? <Check /> : undefined}>
      {marker ? <span data-state-word>{word}</span> : word}
    </Chip>
  );
}
