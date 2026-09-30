import { describe, expect, it } from "vitest";
import aliasFile from "../../content/curriculum/topic-aliases.json";
import curriculum from "../../content/curriculum/p3-maths-moe-2025-10.json";
import {
  applyKindMapping,
  buildAliasIndex,
  buildNoticeReview,
  kindFromSchoolWording,
  matchTopicWording,
  normaliseWording,
  partSummary,
  pickMathematics,
  reviewFormat,
  unmatchedWordings,
} from "@/domain/assessments/notice";
import { NoticeExtractionSchema, TopicAliasTableSchema } from "@/schemas/notice-extraction";

const table = TopicAliasTableSchema.parse(aliasFile);
const index = buildAliasIndex(table.aliases);
const codes = new Set(curriculum.domains.flatMap((domain) => domain.topics.map((topic) => topic.code)));

/** The 13 wordings of the example letter's Mathematics list, with the topic each must land on. */
const EXAMPLE: Array<[string, string | "across"]> = [
  ["1. Numbers to 10 000", "P3-NA-WN"],
  ["2. Addition and Subtraction", "P3-NA-AS"],
  ["3. Money", "P3-NA-MN"],
  ["4. Multiplication Tables of 6, 7, 8 and 9", "P3-NA-MD"],
  ["5. Multiplication and Division", "P3-NA-MD"],
  ["6. More Word Problems", "across"],
  ["7. Bar Graphs", "P3-ST-BG"],
  ["8. Angles", "P3-MG-AN"],
  ["9. Perpendicular and Parallel Lines", "P3-MG-PL"],
  ["10. Fractions", "P3-NA-FR"],
  ["11. Length, Mass and Volume", "P3-MG-LM"],
  ["12. Area and Perimeter", "P3-MG-AR"],
  ["13. Time", "P3-MG-TM"],
];

describe("topic alias file", () => {
  it("only names topics that exist in the published curriculum file", () => {
    for (const alias of table.aliases) {
      if ("topic" in alias) expect(codes.has(alias.topic), alias.label).toBe(true);
    }
  });

  it("does not list the same wording twice", () => {
    const keys = table.aliases.map((alias) => normaliseWording(alias.label));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("matchTopicWording", () => {
  it.each(EXAMPLE)("maps %s", (label, expected) => {
    const match = matchTopicWording(label, index);
    if (expected === "across") expect(match).toEqual({ kind: "applies_across" });
    else expect(match).toEqual({ kind: "topic", code: expected });
  });

  it("ignores case, punctuation, ampersands, plurals and digit grouping", () => {
    expect(matchTopicWording("NUMBERS TO 10,000", index)).toEqual({ kind: "topic", code: "P3-NA-WN" });
    expect(matchTopicWording("numbers to 10000", index)).toEqual({ kind: "topic", code: "P3-NA-WN" });
    expect(matchTopicWording("Addition & Subtraction", index)).toEqual({ kind: "topic", code: "P3-NA-MN".replace("MN", "AS") });
    expect(matchTopicWording("bar graph", index)).toEqual({ kind: "topic", code: "P3-ST-BG" });
    expect(matchTopicWording("Angle", index)).toEqual({ kind: "topic", code: "P3-MG-AN" });
    expect(matchTopicWording("  Length,  Mass & Volumes ", index)).toEqual({ kind: "topic", code: "P3-MG-LM" });
    expect(matchTopicWording("Perpendicular and Parallel Line", index)).toEqual({ kind: "topic", code: "P3-MG-PL" });
    expect(matchTopicWording("Word problems", index)).toEqual({ kind: "applies_across" });
  });

  it("leaves unknown wording unmatched instead of guessing", () => {
    expect(matchTopicWording("Symmetry", index)).toEqual({ kind: "unmatched" });
    expect(matchTopicWording("Money and Fractions", index)).toEqual({ kind: "unmatched" });
    expect(matchTopicWording("", index)).toEqual({ kind: "unmatched" });
  });
});

/** Builds a subject or part the way the gateway does, so every optional key is present. */
const subjectOf = (value: Record<string, unknown>) => NoticeExtractionSchema.parse({ subjects: [{ topics: [], notes: [], ...value }] }).subjects[0]!;
const sectionOf = (value: Record<string, unknown>) =>
  subjectOf({ subject: "Mathematics", format: { sections: [value] } }).format!.sections[0]!;

describe("kindFromSchoolWording", () => {
  it("maps the wording on the example letters", () => {
    expect(kindFromSchoolWording("Multiple-Choice questions")).toEqual({ kind: "mcq", confident: true });
    expect(kindFromSchoolWording("Open-ended questions")).toEqual({ kind: "short", confident: true });
    expect(kindFromSchoolWording("Word Problems")).toEqual({ kind: "word_problem", confident: true });
    expect(kindFromSchoolWording("Structured questions")).toEqual({ kind: "short", confident: false });
    expect(kindFromSchoolWording("Oral")).toBeNull();
  });

  it("overrides a wrong kind and flags structured questions", () => {
    const base = { label: "Section B", wording: "Open-ended questions", kind: "mcq", questionCount: 16, totalMarks: 26, confident: true };
    expect(applyKindMapping(sectionOf(base))).toMatchObject({ kind: "short", confident: true });
    expect(applyKindMapping(sectionOf({ ...base, wording: "Structured questions", label: "Booklet B" }))).toMatchObject({ kind: "short", confident: false });
    expect(applyKindMapping(sectionOf({ ...base, wording: undefined }))).toMatchObject({ kind: "mcq" });
  });
});

const notice = NoticeExtractionSchema.parse({
  documentYear: 2026,
  subjects: [
    {
      subject: "Science",
      topics: [{ schoolLabel: "Plants", confident: true }],
      notes: [],
    },
    {
      subject: "Mathematics",
      assessmentType: "end_of_year",
      date: "2026-10-27",
      startTime: "08:00",
      durationMinutes: 90,
      topics: [
        ...EXAMPLE.map(([label]) => ({ schoolLabel: label.replace(/^\d+\.\s+/, ""), confident: true })),
        { schoolLabel: "Symmetry", confident: true },
      ],
      format: {
        sections: [
          { label: "Section A", kind: "mcq", wording: "Multiple-Choice questions", questionCount: 6, totalMarks: 12, confident: true },
          { label: "Section B", kind: "mcq", wording: "Open-ended questions", questionCount: 16, totalMarks: 26, confident: true },
          { label: "Section C", kind: "word_problem", wording: "Word Problems", questionCount: 4, totalMarks: 12, confident: true },
        ],
        totalMarks: 50,
      },
      notes: ["Protractors are not allowed"],
    },
  ],
});

describe("buildNoticeReview", () => {
  const found = pickMathematics(notice);

  it("finds the Mathematics part and remembers there were other subjects", () => {
    expect(found?.subject.subject).toBe("Mathematics");
    expect(found?.multipleSubjects).toBe(true);
    expect(pickMathematics(NoticeExtractionSchema.parse({ subjects: [{ subject: "Science", topics: [], notes: [] }] }))).toBeNull();
  });

  function review(guesses: Array<{ schoolLabel: string; topicCodes: string[] }> = []) {
    if (!found) throw new Error("no maths");
    return buildNoticeReview({ ...found, index, knownCodes: codes, guesses });
  }

  it("maps all thirteen example wordings to ten topics plus the word-problems note, none needing a check", () => {
    const result = review();
    expect(result.topics.map((topic) => topic.code).sort()).toEqual(
      ["P3-MG-AN", "P3-MG-AR", "P3-MG-LM", "P3-MG-PL", "P3-MG-TM", "P3-NA-AS", "P3-NA-FR", "P3-NA-MD", "P3-NA-MN", "P3-NA-WN", "P3-ST-BG"],
    );
    expect(result.topics.every((topic) => !topic.check)).toBe(true);
    expect(result.appliesAcross).toBe(true);
  });

  it("keeps a wording no one could place as a note for the parent, never as a topic", () => {
    expect(review().unmatchedLabels).toEqual(["Symmetry"]);
    expect(unmatchedWordings(found!.subject, index)).toEqual(["Symmetry"]);
  });

  it("marks a model's guess as Please check and ignores a code that is not in the curriculum", () => {
    const result = review([{ schoolLabel: "Symmetry", topicCodes: ["P3-MG-AN", "P3-XX-MADE-UP"] }]);
    expect(result.unmatchedLabels).toEqual([]);
    // Angles was also listed on the notice, so one certain route keeps it unchecked.
    expect(result.topics.find((topic) => topic.code === "P3-MG-AN")?.check).toBe(false);
    expect(result.topics.some((topic) => topic.code === "P3-XX-MADE-UP")).toBe(false);
    const only = buildNoticeReview({
      subject: { ...found!.subject, topics: [{ schoolLabel: "Symmetry", confident: true }] },
      multipleSubjects: false,
      index,
      knownCodes: codes,
      guesses: [{ schoolLabel: "Symmetry", topicCodes: ["P3-MG-AN"] }],
    });
    expect(only.topics).toEqual([{ code: "P3-MG-AN", check: true }]);
  });

  it("flags a topic the notice was unsure about", () => {
    const result = buildNoticeReview({
      subject: { ...found!.subject, topics: [{ schoolLabel: "Fractions", confident: false }] },
      multipleSubjects: false,
      index,
      knownCodes: codes,
      guesses: [],
    });
    expect(result.topics).toEqual([{ code: "P3-NA-FR", check: true }]);
  });

  it("reads the assessment, the paper format and the notes", () => {
    const result = review();
    expect(result.assessment).toMatchObject({ type: "end_of_year", name: "End-of-year exam", date: "2026-10-27", startTime: "08:00", durationMinutes: 90 });
    expect(result.assessment.check).toEqual({ type: false, date: false, duration: false });
    expect(result.format?.parts.map(partSummary)).toEqual([
      "Section A: 6 multiple-choice, 12 marks",
      "Section B: 16 short-answer, 26 marks",
      "Section C: 4 word problems, 12 marks",
    ]);
    expect(result.format?.parts[1]?.kind).toBe("short");
    expect(result.format?.totalMarks).toBe(50);
    expect(result.notes).toEqual(["Protractors are not allowed"]);
    expect(reviewFormat(result)).toMatchObject({ durationMinutes: 90 });
    expect(reviewFormat(result, null)).toBeNull();
  });

  it("asks the parent to check what the notice left out", () => {
    const result = buildNoticeReview({
      subject: subjectOf({ subject: "Mathematics" }),
      multipleSubjects: false,
      index,
      knownCodes: codes,
      guesses: [],
    });
    expect(result.assessment).toMatchObject({ type: "other", name: "Assessment", date: null, durationMinutes: null });
    expect(result.assessment.check).toEqual({ type: true, date: true, duration: true });
    expect(result.format).toBeNull();
  });
});
