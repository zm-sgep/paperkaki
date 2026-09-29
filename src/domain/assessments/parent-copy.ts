/**
 * Parent-facing wording for the assessment setup screens. Pure, so the sentences are unit-tested
 * and never assembled inside components. No internal terms and no percentages (UX rule 9).
 */

/** "Fractions", "Fractions and Time", "Fractions, Time and Angles". */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "40 marks · 45 minutes · Fractions, Time, Measurement" */
export function summaryLine(input: { totalMarks: number; durationMinutes: number; topicLabels: readonly string[] }): string {
  return [`${input.totalMarks} marks`, `${input.durationMinutes} minutes`, input.topicLabels.join(", ")]
    .filter((part) => part !== "")
    .join(" · ");
}

/** The calm notice for topics the bank cannot cover yet. Null when nothing is left out. */
export function excludedTopicsNotice(excludedLabels: readonly string[], coveredCount: number): string | null {
  if (excludedLabels.length === 0) return null;
  const rest =
    coveredCount === 0
      ? "so there is nothing to build a mock from yet"
      : coveredCount === 1
        ? "so this mock covers the other topic"
        : `so this mock covers the other ${coveredCount} topics`;
  return `We can't include ${joinLabels(excludedLabels)} yet, ${rest}.`;
}

/** "Darius · Mathematics WA2 · Tue 14 Oct": the context line kept visible on every setup step. */
export function contextLine(input: { childNickname: string; subject: string; name: string; dateText: string }): string {
  return `${input.childNickname} · ${input.subject} ${input.name} · ${input.dateText}`;
}

/** "Choose topics" / "Topics confirmed": where an assessment stands, in words. */
export function assessmentStateText(scopeConfirmed: boolean): string {
  return scopeConfirmed ? "Topics confirmed" : "Choose topics";
}
