/**
 * Turning what a school notice says into what the parent reviews (Milestone 5). Pure and deterministic:
 * wording is matched to curriculum topics through an alias table before any model is asked, and a
 * model's answer is only ever a suggestion that is marked "Please check". Nothing here creates a
 * curriculum topic from a letter.
 */
import type { NoticeExtraction, NoticeSection, NoticeSubject } from "@/schemas/notice-extraction";
import type { AssessmentType } from "./assessment-types";
import { deriveAssessmentName, MAX_ASSESSMENT_NAME_LENGTH } from "./assessment-types";
import type { PaperFormat, SectionKind } from "./paper-format";

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

/**
 * Compares wordings, not spellings: case, punctuation, "&" and "and", plurals, digit grouping
 * ("10 000", "10,000", "10000") and list numbers ("4. Money") do not matter.
 */
export function normaliseWording(text: string): string {
  const words = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^\s*\(?\d{1,2}[.)]\s+/, "")
    .replace(/&/g, " and ")
    .replace(/(\d)[\s,  ](?=\d{3}(?!\d))/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "");
  return words.map(singular).join(" ");
}

function singular(word: string): string {
  if (word.length <= 3 || /^\d+$/.test(word)) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  return word.endsWith("s") ? word.slice(0, -1) : word;
}

export type TopicAlias = { label: string; topic: string } | { label: string; appliesAcross: true };

export type AliasIndex = ReadonlyMap<string, { topic: string } | { appliesAcross: true }>;

export function buildAliasIndex(aliases: readonly TopicAlias[]): AliasIndex {
  const index = new Map<string, { topic: string } | { appliesAcross: true }>();
  for (const alias of aliases) {
    const key = normaliseWording(alias.label);
    if (key === "" || index.has(key)) continue;
    index.set(key, "topic" in alias ? { topic: alias.topic } : { appliesAcross: true });
  }
  return index;
}

export type WordingMatch = { kind: "topic"; code: string } | { kind: "applies_across" } | { kind: "unmatched" };

/** The alias table's answer for one school wording. */
export function matchTopicWording(label: string, index: AliasIndex): WordingMatch {
  const hit = index.get(normaliseWording(label));
  if (!hit) return { kind: "unmatched" };
  return "topic" in hit ? { kind: "topic", code: hit.topic } : { kind: "applies_across" };
}

/** What a school's words for a question type mean. Null when they say nothing we know. */
export function kindFromSchoolWording(wording: string): { kind: SectionKind; confident: boolean } | null {
  const text = normaliseWording(wording);
  if (/\bmultiple choice\b|\bmcq\b/.test(text)) return { kind: "mcq", confident: true };
  if (/\bword problem\b/.test(text)) return { kind: "word_problem", confident: true };
  if (/\bopen ended\b|\bshort answer\b|\bshort question\b/.test(text)) return { kind: "short", confident: true };
  // Structured questions vary from school to school: short answer is the closest, and it is worth a look.
  if (/\bstructured\b/.test(text)) return { kind: "short", confident: false };
  return null;
}

// ---------------------------------------------------------------------------
// The Mathematics part
// ---------------------------------------------------------------------------

/** The notice's Mathematics entry, and whether the notice also covers other subjects. */
export function pickMathematics(extraction: NoticeExtraction): { subject: NoticeSubject; multipleSubjects: boolean } | null {
  const subject = extraction.subjects.find((entry) => /^math/.test(normaliseWording(entry.subject)));
  if (!subject) return null;
  return { subject, multipleSubjects: extraction.subjects.length > 1 };
}

// ---------------------------------------------------------------------------
// The review
// ---------------------------------------------------------------------------

export type ReviewPart = {
  label: string;
  booklet?: string | undefined;
  kind: SectionKind;
  questionCount: number;
  totalMarks: number;
  /** True when the parent should look at this part ("Please check"). */
  check: boolean;
};

export type ReviewTopic = {
  /** A curriculum topic code, always one that exists in the published curriculum. */
  code: string;
  /** True when the topic came from a model's guess or a wording the notice was unsure about. */
  check: boolean;
};

export type NoticeReview = {
  multipleSubjects: boolean;
  assessment: {
    type: AssessmentType;
    name: string;
    date: string | null;
    startTime: string | null;
    durationMinutes: number | null;
    check: { type: boolean; date: boolean; duration: boolean };
  };
  topics: ReviewTopic[];
  /** The notice says word problems are part of the paper across topics. */
  appliesAcross: boolean;
  /** School wordings that matched no topic. The parent is asked to tick what fits. */
  unmatchedLabels: string[];
  format: { parts: ReviewPart[]; totalMarks: number | null } | null;
  notes: string[];
};

export type TopicGuess = { schoolLabel: string; topicCodes: readonly string[] };

/** The wordings to send to a model: the ones the alias table could not place, once each. */
export function unmatchedWordings(subject: NoticeSubject, index: AliasIndex): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const topic of subject.topics) {
    if (matchTopicWording(topic.schoolLabel, index).kind !== "unmatched") continue;
    const key = normaliseWording(topic.schoolLabel);
    if (key !== "" && !seen.has(key)) {
      seen.add(key);
      out.push(topic.schoolLabel);
    }
  }
  return out;
}

/** Corrects a part's kind from the school's own words, and flags it when those words were uncertain. */
export function applyKindMapping(section: NoticeSection): NoticeSection {
  const mapped = section.wording ? kindFromSchoolWording(section.wording) : null;
  if (!mapped) return section;
  return { ...section, kind: mapped.kind, confident: section.confident && mapped.confident };
}

export function noticeFormatToParts(subject: NoticeSubject): ReviewPart[] | null {
  if (!subject.format) return null;
  return subject.format.sections.map(applyKindMapping).map((section) => ({
    label: section.label,
    ...(section.booklet === undefined ? {} : { booklet: section.booklet }),
    kind: section.kind,
    questionCount: section.questionCount,
    totalMarks: section.totalMarks,
    check: !section.confident,
  }));
}

/**
 * Builds what screen B shows. `guesses` are a model's answers for the wordings in
 * `unmatchedWordings`; they only ever pick codes from `knownCodes` and are always marked "Please check".
 */
export function buildNoticeReview(input: {
  subject: NoticeSubject;
  multipleSubjects: boolean;
  index: AliasIndex;
  knownCodes: ReadonlySet<string>;
  guesses: readonly TopicGuess[];
}): NoticeReview {
  const { subject, index, knownCodes } = input;
  const guessed = new Map(input.guesses.map((guess) => [normaliseWording(guess.schoolLabel), guess.topicCodes]));

  const byCode = new Map<string, ReviewTopic>();
  const addTopic = (code: string, check: boolean): void => {
    if (!knownCodes.has(code)) return;
    const seen = byCode.get(code);
    // Several wordings can land on one topic; it is only "checked" when every route to it was uncertain.
    if (seen) seen.check = seen.check && check;
    else byCode.set(code, { code, check });
  };

  let appliesAcross = false;
  const unmatchedLabels: string[] = [];
  for (const topic of subject.topics) {
    const match = matchTopicWording(topic.schoolLabel, index);
    if (match.kind === "topic") addTopic(match.code, !topic.confident);
    else if (match.kind === "applies_across") appliesAcross = true;
    else {
      const codes = (guessed.get(normaliseWording(topic.schoolLabel)) ?? []).filter((code) => knownCodes.has(code));
      if (codes.length === 0) unmatchedLabels.push(topic.schoolLabel);
      for (const code of codes) addTopic(code, true);
    }
  }

  const type: AssessmentType = subject.assessmentType ?? "other";
  const customName = subject.assessmentName ?? "Assessment";
  const named = deriveAssessmentName(type, customName.slice(0, MAX_ASSESSMENT_NAME_LENGTH));
  const parts = noticeFormatToParts(subject);
  const totalMarks = subject.format?.totalMarks ?? null;

  return {
    multipleSubjects: input.multipleSubjects,
    assessment: {
      type,
      name: named.ok ? named.name : "Assessment",
      date: subject.date ?? null,
      startTime: subject.startTime ?? null,
      durationMinutes: subject.durationMinutes ?? null,
      check: {
        type: subject.assessmentType === undefined || subject.assessmentType === "other",
        date: subject.date === undefined,
        duration: subject.durationMinutes === undefined,
      },
    },
    topics: [...byCode.values()],
    appliesAcross,
    unmatchedLabels,
    format: parts ? { parts, totalMarks } : null,
    notes: subject.notes,
  };
}

/** The review's parts and time as a PaperFormat, or null when the notice gave no parts or no time. */
export function reviewFormat(review: NoticeReview, durationMinutes: number | null = review.assessment.durationMinutes): PaperFormat | null {
  if (!review.format || durationMinutes === null) return null;
  return {
    durationMinutes,
    sections: review.format.parts.map((part) => ({
      label: part.label,
      ...(part.booklet === undefined ? {} : { booklet: part.booklet }),
      kind: part.kind,
      questionCount: part.questionCount,
      totalMarks: part.totalMarks,
    })),
  };
}

const KIND_TEXT: Record<SectionKind, (count: number) => string> = {
  mcq: () => "multiple-choice",
  short: () => "short-answer",
  word_problem: (count) => (count === 1 ? "word problem" : "word problems"),
};

/** "Section A: 6 multiple-choice, 12 marks". */
export function partSummary(part: Pick<ReviewPart, "label" | "kind" | "questionCount" | "totalMarks">): string {
  return `${part.label}: ${part.questionCount} ${KIND_TEXT[part.kind](part.questionCount)}, ${part.totalMarks} ${part.totalMarks === 1 ? "mark" : "marks"}`;
}
