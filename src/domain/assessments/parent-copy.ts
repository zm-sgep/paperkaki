import { ASSESSMENT_TYPE_LABEL, type AssessmentType } from "./assessment-types";
import { bookletOf, formatTotalMarks, type PaperFormat, type SectionKind } from "./paper-format";
import type { FormatChoiceId } from "./paper-format-presets";

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

/** "45 min", "1 h", "1 h 30 min". */
export function durationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const SECTION_LETTER = /^section\s+([A-Za-z0-9]+)$/i;

/** "Sections A, B, C" when the parts are named that way, otherwise their names: "Booklet A, Booklet B". */
export function formatPartsText(format: PaperFormat): string {
  const names: string[] = [];
  for (const section of format.sections) {
    const name = bookletOf(section) ?? section.label.trim();
    if (name !== "" && names[names.length - 1] !== name) names.push(name);
  }
  const letters = names.map((name) => SECTION_LETTER.exec(name)?.[1]);
  if (names.length > 0 && letters.every((letter) => letter !== undefined)) {
    return `${names.length === 1 ? "Section" : "Sections"} ${letters.join(", ")}`;
  }
  return names.join(", ");
}

/** "50 marks · 1 h 30 min · Sections A, B, C": the paper format in one line. */
export function formatSummaryLine(format: PaperFormat): string {
  return [`${formatTotalMarks(format)} marks`, durationText(format.durationMinutes), formatPartsText(format)]
    .filter((part) => part !== "")
    .join(" · ");
}

const KIND_COUNT_TEXT: Record<SectionKind, string> = {
  mcq: "multiple choice",
  short: "short answer",
  word_problem: "word problems",
};

/** "6 multiple choice · 16 short answer · 4 word problems". */
export function formatKindsText(format: PaperFormat): string {
  return format.sections.map((section) => `${section.questionCount} ${KIND_COUNT_TEXT[section.kind]}`).join(" · ");
}

/** The kind of assessment as it reads in "future ... papers": "WA2", "end-of-year exam", "class test", or the parent's own name. */
export function assessmentTypeInPapers(type: AssessmentType, name: string): string {
  switch (type) {
    case "wa1":
    case "wa2":
    case "wa3":
      return ASSESSMENT_TYPE_LABEL[type];
    case "end_of_year":
      return "end-of-year exam";
    case "class_test":
      return "class test";
    case "other":
      return name;
  }
}

/** "Use this format for Darius's future WA2 papers" */
export function futureFormatLabel(childNickname: string, type: AssessmentType, name: string): string {
  return `Use this format for ${childNickname}'s future ${assessmentTypeInPapers(type, name)} papers`;
}

/** The wording of a ready-made format choice on the "Customise paper" panel. */
export function formatChoiceTitle(choice: FormatChoiceId, format: PaperFormat): string {
  const total = `${formatTotalMarks(format)} marks`;
  const time = durationText(format.durationMinutes);
  switch (choice) {
    case "standard":
      return `Standard mock (${formatPartsText(format)} · ${total} · ${time})`;
    case "p3_end_of_year_common":
      return `Common Primary 3 end-of-year format (${formatPartsText(format)} · ${total} · ${time})`;
    case "p3_weighted_common":
      return `Short weighted assessment (${total} · ${time})`;
    case "saved":
      return `Your saved school format (${formatPartsText(format)} · ${total} · ${time})`;
  }
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
