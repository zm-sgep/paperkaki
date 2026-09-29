/**
 * Paper format presets and the recommendation rule.
 *
 * Presets are suggestions, never claims about a particular school. Recommend first: an end-of-year
 * exam gets the common Primary 3 end-of-year layout, shorter assessments get the standard mock, and a
 * format the parent already saved for this child and assessment type comes before both.
 */
import type { AssessmentType } from "./assessment-types";
import { FORMAT_LIMITS, sameFormat, type FormatSection, type PaperFormat } from "./paper-format";
import { recommendPaperSettings } from "./recommend";

export const PAPER_FORMAT_PRESETS = ["standard", "p3_end_of_year_common", "p3_weighted_common"] as const;
export type PaperFormatPreset = (typeof PAPER_FORMAT_PRESETS)[number];

/** A format choice: a preset or the format the parent saved earlier. */
export type FormatChoiceId = PaperFormatPreset | "saved";

/**
 * Today's mock: multiple choice first, then short answer, scaled to the paper's marks. About a
 * quarter of the marks are multiple choice (rounded half up), and the rest are short answer
 * questions worth 1 or 2 marks. How many questions are worth 2 marks is a choice: the first variant
 * makes the multiple choice questions all 1 mark and puts about a third of the short-answer marks in
 * 2-mark questions; the others move those numbers one at a time, so the caller can pick the first
 * one the question bank can fill.
 */
export function standardFormatVariants(settings: { totalMarks: number; durationMinutes: number }): PaperFormat[] {
  const multipleChoiceMarks = Math.floor((settings.totalMarks + 2) / 4);
  const shortMarks = settings.totalMarks - multipleChoiceMarks;

  const mcqParts: (FormatSection | undefined)[] = [];
  if (multipleChoiceMarks > 0) {
    for (let twos = 0; 2 * twos <= multipleChoiceMarks; twos += 1) {
      mcqParts.push({
        label: "Section A",
        kind: "mcq",
        questionCount: multipleChoiceMarks - twos,
        totalMarks: multipleChoiceMarks,
        ...(twos === 0 ? { marksEach: 1 } : {}),
      });
    }
  } else {
    mcqParts.push(undefined);
  }

  const shortParts: (FormatSection | undefined)[] = [];
  if (shortMarks > 0) {
    const primary = Math.round(shortMarks / 3);
    for (let step = 0; step <= shortMarks; step += 1) {
      for (const twos of step === 0 ? [primary] : [primary - step, primary + step]) {
        if (twos >= 0 && 2 * twos <= shortMarks && shortMarks - twos <= FORMAT_LIMITS.maxQuestions) {
          shortParts.push({ label: "", kind: "short", questionCount: shortMarks - twos, totalMarks: shortMarks });
        }
      }
    }
    if (shortParts.length === 0) shortParts.push({ label: "", kind: "short", questionCount: shortMarks - primary, totalMarks: shortMarks });
  } else {
    shortParts.push(undefined);
  }

  const variants: PaperFormat[] = [];
  for (const mcq of mcqParts) {
    for (const short of shortParts) {
      const sections: FormatSection[] = [];
      if (mcq) sections.push({ ...mcq });
      if (short) sections.push({ ...short, label: sections.length === 0 ? "Section A" : "Section B" });
      variants.push({ durationMinutes: settings.durationMinutes, sections });
    }
  }
  return variants;
}

/** The first (preferred) standard format for these settings. */
export function standardFormat(settings: { totalMarks: number; durationMinutes: number }): PaperFormat {
  return standardFormatVariants(settings)[0] as PaperFormat;
}

/** Section A: 6 multiple choice x 2 = 12. Section B: 16 open-ended, 26 marks. Section C: 4 word problems x 3 = 12. */
export const END_OF_YEAR_COMMON_FORMAT: PaperFormat = {
  durationMinutes: 90,
  sections: [
    { label: "Section A", kind: "mcq", questionCount: 6, totalMarks: 12, marksEach: 2 },
    { label: "Section B", kind: "short", questionCount: 16, totalMarks: 26 },
    { label: "Section C", kind: "word_problem", questionCount: 4, totalMarks: 12, marksEach: 3 },
  ],
};

/** Section A: 5 multiple choice x 2 = 10. Section B: 5 short answer x 2 = 10. */
export const WEIGHTED_COMMON_FORMAT: PaperFormat = {
  durationMinutes: 30,
  sections: [
    { label: "Section A", kind: "mcq", questionCount: 5, totalMarks: 10, marksEach: 2 },
    { label: "Section B", kind: "short", questionCount: 5, totalMarks: 10, marksEach: 2 },
  ],
};

function copyFormat(format: PaperFormat): PaperFormat {
  return { durationMinutes: format.durationMinutes, sections: format.sections.map((section) => ({ ...section })) };
}

/** The format a preset stands for. Only `standard` depends on how many topics the mock covers. */
export function presetFormat(preset: PaperFormatPreset, context: { topicCount: number }): PaperFormat {
  switch (preset) {
    case "standard":
      return standardFormat(recommendPaperSettings({ topicCount: context.topicCount }));
    case "p3_end_of_year_common":
      return copyFormat(END_OF_YEAR_COMMON_FORMAT);
    case "p3_weighted_common":
      return copyFormat(WEIGHTED_COMMON_FORMAT);
  }
}

export type FormatRecommendation = { choice: FormatChoiceId; format: PaperFormat };

/** The first suggestion for an assessment: the child's saved format, else by assessment type. */
export function recommendPaperFormat(input: {
  assessmentType: AssessmentType;
  topicCount: number;
  savedFormat?: PaperFormat | null | undefined;
}): FormatRecommendation {
  if (input.savedFormat) return { choice: "saved", format: copyFormat(input.savedFormat) };
  const preset: PaperFormatPreset = input.assessmentType === "end_of_year" ? "p3_end_of_year_common" : "standard";
  return { choice: preset, format: presetFormat(preset, { topicCount: input.topicCount }) };
}

export type FormatChoice = { id: FormatChoiceId; format: PaperFormat; recommended: boolean };

/**
 * Every ready-made choice, the recommended one first. A preset the saved format already matches is
 * not offered twice.
 */
export function paperFormatChoices(input: {
  assessmentType: AssessmentType;
  topicCount: number;
  savedFormat?: PaperFormat | null | undefined;
}): FormatChoice[] {
  const first = recommendPaperFormat(input);
  const all: FormatChoice[] = [];
  if (input.savedFormat) all.push({ id: "saved", format: copyFormat(input.savedFormat), recommended: false });
  for (const preset of PAPER_FORMAT_PRESETS) {
    all.push({ id: preset, format: presetFormat(preset, { topicCount: input.topicCount }), recommended: false });
  }
  const unique: FormatChoice[] = [];
  for (const choice of all) {
    if (!unique.some((kept) => sameFormat(kept.format, choice.format))) unique.push(choice);
  }
  // The recommended choice first, then the preset that fits the kind of assessment, then the rest.
  const fitting: FormatChoiceId = input.assessmentType === "end_of_year" ? "p3_end_of_year_common" : "standard";
  const rank = (choice: FormatChoice): number => (choice.id === first.choice ? 0 : choice.id === fitting ? 1 : 2);
  const ordered = [...unique].sort((a, b) => rank(a) - rank(b));
  return ordered.map((choice, index) => ({ ...choice, recommended: index === 0 }));
}
