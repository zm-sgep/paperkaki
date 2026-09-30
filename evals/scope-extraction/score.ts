import type { NoticeReview } from "../../src/domain/assessments/notice";

/** What a correct reading looks like for one notice (see expected.json). */
export type Expected = {
  date: string;
  startTime: string;
  durationMinutes: number;
  assessmentType: string;
  topics: string[];
  appliesAcross: boolean;
  sections: { label: string; kind: string; questionCount: number; totalMarks: number }[];
  notesMention: string[];
};

export type FieldScore = { field: string; correct: number; total: number };

/**
 * Scores a review against what it should be, field by field. Topics are scored as a set (each expected
 * topic found counts, each extra topic counts against). Format parts are scored on kind, question count and
 * marks, one point each per expected part, in order. Pure, so the scoring itself is unit-tested.
 */
export function scoreReview(review: NoticeReview, expected: Expected): FieldScore[] {
  const found = new Set(review.topics.map((topic) => topic.code));
  const wanted = new Set(expected.topics);
  const hits = [...wanted].filter((code) => found.has(code)).length;
  const extras = [...found].filter((code) => !wanted.has(code)).length;
  const parts = review.format?.parts ?? [];
  const partPoints = (pick: (part: { kind: string; questionCount: number; totalMarks: number }) => unknown, key: keyof Expected["sections"][number]): number =>
    expected.sections.filter((want, i) => parts[i] !== undefined && pick(parts[i] as never) === want[key]).length;

  return [
    { field: "date", correct: review.assessment.date === expected.date ? 1 : 0, total: 1 },
    { field: "start time", correct: review.assessment.startTime === expected.startTime ? 1 : 0, total: 1 },
    { field: "duration", correct: review.assessment.durationMinutes === expected.durationMinutes ? 1 : 0, total: 1 },
    { field: "assessment type", correct: review.assessment.type === expected.assessmentType ? 1 : 0, total: 1 },
    { field: "topics found", correct: hits, total: wanted.size },
    { field: "topics not in the notice", correct: Math.max(0, wanted.size - extras), total: wanted.size },
    { field: "word problems across topics", correct: review.appliesAcross === expected.appliesAcross ? 1 : 0, total: 1 },
    { field: "format: parts named", correct: expected.sections.filter((want, i) => parts[i]?.label === want.label).length, total: expected.sections.length },
    { field: "format: question type", correct: partPoints((part) => part.kind, "kind"), total: expected.sections.length },
    { field: "format: question count", correct: partPoints((part) => part.questionCount, "questionCount"), total: expected.sections.length },
    { field: "format: marks", correct: partPoints((part) => part.totalMarks, "totalMarks"), total: expected.sections.length },
    {
      field: "notes",
      correct: expected.notesMention.filter((word) => review.notes.some((note) => note.toLowerCase().includes(word))).length,
      total: expected.notesMention.length,
    },
  ];
}
