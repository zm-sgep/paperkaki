import { summariseTopic, type TopicOutcomeState } from "./summary";
import { MASTERY_STATE_RANK, type MasteryState } from "./types";

/**
 * What the parent's Progress says in one sentence (UX_SPEC section 5), by rule: the topics that improved
 * and the one topic that most needs attention. Pure and deterministic. The sentence never carries a number
 * or a percentage, and it only says a topic "still" needs attention when there was earlier work to compare with.
 */

export type ProgressTopic = {
  topicId: string;
  /** "Fractions". */
  label: string;
  state: MasteryState;
  /** 0..1, only to order topics in the same state. */
  recentAccuracy?: number;
  /** The topic's skills with the state they had before the latest work. `previousState` is left out when there was none. */
  outcomes: TopicOutcomeState[];
};

export type ProgressSentence = {
  sentence: string;
  improved: { topicId: string; label: string }[];
  /** The one topic that most needs attention, or null when none does. */
  attention: { topicId: string; label: string; stillNeeds: boolean } | null;
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A topic that has been started and is not yet solid. */
export function topicNeedsWork(topic: Pick<ProgressTopic, "state">): boolean {
  return topic.state === "learning" || topic.state === "developing";
}

function namesOf(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels[0]} and ${labels[1]}`;
}

export function progressSentence(topics: readonly ProgressTopic[]): ProgressSentence {
  const started = topics.filter((topic) => topic.state !== "not_started");
  const improved = started
    .filter((topic) => summariseTopic(topic.label, topic.outcomes).improved)
    .map((topic) => ({ topicId: topic.topicId, label: topic.label }));
  const weakest = started
    .filter(topicNeedsWork)
    .sort(
      (a, b) =>
        MASTERY_STATE_RANK[a.state] - MASTERY_STATE_RANK[b.state] ||
        (a.recentAccuracy ?? 1) - (b.recentAccuracy ?? 1) ||
        compareText(a.label, b.label),
    )[0];
  const attention = weakest
    ? {
        topicId: weakest.topicId,
        label: weakest.label,
        stillNeeds: weakest.outcomes.some((outcome) => outcome.previousState !== undefined),
      }
    : null;

  const parts: string[] = [];
  if (improved.length > 0) parts.push(`${namesOf(improved.map((topic) => topic.label))} improved.`);
  if (attention) parts.push(`${attention.label} ${attention.stillNeeds ? "still needs" : "needs"} attention.`);
  if (parts.length === 0) {
    parts.push(started.length === 0 ? "No practice or mocks to look at yet." : "Everything is on track so far.");
  }
  return { sentence: parts.join(" "), improved, attention };
}

/** "Based on 8 questions from 2 sessions": how much the state rests on, in words. */
export function evidenceWords(evidenceCount: number, sessions: number): string {
  if (evidenceCount <= 0) return "No questions answered yet";
  const questions = evidenceCount === 1 ? "1 question" : `${evidenceCount} questions`;
  const times = sessions <= 1 ? "1 session" : `${sessions} sessions`;
  return `Based on ${questions} from ${times}`;
}

/** Kinds of slip the marking saw, in the parent's plain words. */
export type MistakePatternKind = "calculation" | "method" | "misread" | "incomplete" | "other" | "blank";

export const MISTAKE_PATTERN_WORDS: Record<MistakePatternKind, string> = {
  calculation: "Slips in the calculation",
  method: "Choosing a method",
  misread: "Reading the question carefully",
  incomplete: "Working that stopped early",
  other: "Other slips",
  blank: "Questions left blank",
};

const PATTERN_ORDER: readonly MistakePatternKind[] = ["calculation", "method", "misread", "incomplete", "blank", "other"];

/** Counts of each kind of slip, most common first (ties in a fixed order). */
export function mistakePatterns(kinds: readonly MistakePatternKind[]): { kind: MistakePatternKind; label: string; count: number }[] {
  const counts = new Map<MistakePatternKind, number>();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return PATTERN_ORDER.filter((kind) => counts.has(kind))
    .map((kind) => ({ kind, label: MISTAKE_PATTERN_WORDS[kind], count: counts.get(kind) as number }))
    .sort((a, b) => b.count - a.count || PATTERN_ORDER.indexOf(a.kind) - PATTERN_ORDER.indexOf(b.kind));
}
