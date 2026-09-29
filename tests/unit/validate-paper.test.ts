import { describe, expect, it } from "vitest";
import { buildBlueprint } from "@/domain/assessments";
import {
  buildScopeReport,
  explainPaperFailures,
  validatePaper,
  type PaperQuestionFacts,
  type SelectedQuestion,
} from "@/domain/papers";
import { hasBannedParentWording } from "@/domain/assessments";

// Two topics, 15 marks: Section A 3 multiple choice (5), Section B 4 short (7), Section C 1 word problem (3).
const blueprint = buildBlueprint({
  curriculumVersionId: "v1",
  level: "P3",
  subject: "Mathematics",
  topics: [
    { topicId: "t1", label: "Fractions", outcomeIds: ["o1"] },
    { topicId: "t2", label: "Money", outcomeIds: ["o2"] },
  ],
  settings: { totalMarks: 15, durationMinutes: 25, difficulty: "balanced" },
  format: {
    durationMinutes: 25,
    sections: [
      { label: "Section A", kind: "mcq", questionCount: 3, totalMarks: 5 },
      { label: "Section B", kind: "short", questionCount: 4, totalMarks: 7 },
      { label: "Section C", kind: "word_problem", questionCount: 1, totalMarks: 3, marksEach: 3 },
    ],
  },
});

function pick(over: Partial<SelectedQuestion> & { questionId: string; number: number }): SelectedQuestion {
  return { sectionCode: "A", sectionIndex: 0, topicId: "t1", marks: 1, difficulty: "standard", ...over };
}

const A = { sectionCode: "A", sectionIndex: 0 } as const;
const B = { sectionCode: "B", sectionIndex: 1 } as const;
const C = { sectionCode: "C", sectionIndex: 2 } as const;

function goodSelection(): SelectedQuestion[] {
  return [
    pick({ questionId: "q1", number: 1, topicId: "t1", ...A, marks: 2 }),
    pick({ questionId: "q2", number: 2, topicId: "t1", ...A, marks: 1 }),
    pick({ questionId: "q3", number: 3, topicId: "t2", ...A, marks: 2 }),
    pick({ questionId: "q4", number: 4, topicId: "t1", ...B, marks: 2 }),
    pick({ questionId: "q5", number: 5, topicId: "t2", ...B, marks: 2 }),
    pick({ questionId: "q6", number: 6, topicId: "t2", ...B, marks: 2 }),
    pick({ questionId: "q7", number: 7, topicId: "t1", ...B, marks: 1 }),
    pick({ questionId: "q8", number: 8, topicId: "t2", ...C, marks: 3 }),
  ];
}

const goodFacts = (selection: readonly SelectedQuestion[]): PaperQuestionFacts[] =>
  selection.map((q) => ({
    questionId: q.questionId,
    approved: true,
    marks: q.marks,
    questionType: q.sectionCode === "A" ? "mcq" : "number",
    hasAnswer: true,
    answerVerified: true,
    verificationReasons: [],
    missingAssets: [],
  }));

describe("validatePaper (M4-03)", () => {
  it("the design used here is what the test assumes", () => {
    expect(blueprint.totalMarks).toBe(15);
    expect(blueprint.format.sections.map((s) => [s.questionCount, s.totalMarks])).toEqual([[3, 5], [4, 7], [1, 3]]);
  });

  it("accepts a paper that meets the format and builds a scope report per topic and part", () => {
    const selection = goodSelection();
    const result = validatePaper({ blueprint, selection, facts: goodFacts(selection) });
    expect(result.ok).toBe(true);
    expect(result.scope.totalMarks).toBe(15);
    expect(result.scope.topics).toEqual([
      { topicId: "t1", label: "Fractions", targetMarks: 8, actualMarks: 6, questionCount: 4 },
      { topicId: "t2", label: "Money", targetMarks: 7, actualMarks: 9, questionCount: 4 },
    ]);
    expect(result.scope.sections).toEqual([
      { code: "A", label: "Section A", marks: 5, questionCount: 3 },
      { code: "B", label: "Section B", marks: 7, questionCount: 4 },
      { code: "C", label: "Section C", marks: 3, questionCount: 1 },
    ]);
  });

  const codesOf = (selection: SelectedQuestion[], facts = goodFacts(selection)) => {
    const result = validatePaper({ blueprint, selection, facts });
    return result.ok ? [] : result.failures.map((f) => f.code);
  };

  it("fails on inexact total marks", () => {
    const selection = goodSelection();
    selection[6] = { ...selection[6]!, marks: 2 };
    expect(codesOf(selection)).toContain("total_marks");
  });

  it("fails when a part misses its marks or its number of questions", () => {
    // Move 1 mark from a Section A question to a Section B question: the total still adds up.
    const marks = goodSelection();
    marks[0] = { ...marks[0]!, marks: 1 };
    marks[6] = { ...marks[6]!, marks: 2 };
    const codes = codesOf(marks);
    expect(codes).toContain("section_marks");
    expect(codes).not.toContain("total_marks");
    // Move a question from Section B to Section A: the part sizes are wrong even though marks are not.
    const count = goodSelection();
    count[3] = { ...count[3]!, ...A, sectionCode: "A", marks: 2 };
    expect(codesOf(count)).toContain("section_count");
  });

  it("does not require topic marks to match the balanced targets, but every topic must be on the paper", () => {
    expect(codesOf(goodSelection())).toEqual([]);
    const selection = goodSelection().map((q) => (q.topicId === "t2" ? { ...q, topicId: "t1" } : q));
    expect(codesOf(selection)).toContain("topic_missing");
  });

  it("fails when a question is outside the confirmed scope", () => {
    const selection = goodSelection();
    selection[0] = { ...selection[0]!, topicId: "elsewhere" };
    expect(codesOf(selection)).toContain("topic_marks");
  });

  it("fails when a question is the wrong kind for its part", () => {
    const selection = goodSelection();
    const facts = goodFacts(selection);
    facts[3] = { ...facts[3]!, questionType: "mcq" }; // multiple choice in the short-answer part
    expect(codesOf(selection, facts)).toContain("section_kind");
    const wordFacts = goodFacts(selection);
    wordFacts[7] = { ...wordFacts[7]!, marks: 2 }; // a 2-mark short question in the word problem part
    expect(codesOf(selection, wordFacts)).toEqual(expect.arrayContaining(["section_kind", "marks_mismatch"]));
  });

  it("fails when a part with marks-each holds a different value", () => {
    const selection = goodSelection();
    selection[7] = { ...selection[7]!, marks: 4 };
    const codes = codesOf(selection);
    expect(codes).toContain("section_marks");
  });

  it("fails on numbering that is not 1 to n in order", () => {
    const gap = goodSelection();
    gap[3] = { ...gap[3]!, number: 9 };
    expect(codesOf(gap)).toContain("numbering");
    const zero = goodSelection().map((q, i) => ({ ...q, number: i }));
    expect(codesOf(zero)).toContain("numbering");
    const twice = goodSelection();
    twice[2] = { ...twice[2]!, number: 2 };
    expect(codesOf(twice)).toContain("numbering");
  });

  it("fails when sections are interleaved or unknown", () => {
    const selection = goodSelection();
    const swapped = [selection[0]!, { ...selection[3]!, number: 2 }, { ...selection[1]!, number: 4 }, ...selection.slice(2, 3).map((q) => ({ ...q, number: 3 })), ...selection.slice(4)];
    expect(codesOf(swapped)).toContain("section_order");
    const unknown = goodSelection();
    unknown[0] = { ...unknown[0]!, sectionCode: "Z" };
    expect(codesOf(unknown)).toContain("section_order");
  });

  it("fails on a repeated question", () => {
    const selection = goodSelection();
    selection[1] = { ...selection[1]!, questionId: "q1", marks: 2 };
    selection[0] = { ...selection[0]!, marks: 2 };
    expect(codesOf(selection)).toContain("duplicate_question");
  });

  it("fails on an empty paper", () => {
    const result = validatePaper({ blueprint, selection: [], facts: [] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failures[0]?.code).toBe("empty_paper");
  });

  it("fails on an unapproved question, missing answer, failed verification and missing file", () => {
    const selection = goodSelection();
    const facts = goodFacts(selection);
    facts[0] = { ...facts[0]!, approved: false };
    facts[1] = { ...facts[1]!, hasAnswer: false };
    facts[2] = { ...facts[2]!, answerVerified: false, verificationReasons: ["Expression gives 5 but the stored answer is 6"] };
    facts[3] = { ...facts[3]!, missingAssets: ["shape.png"] };
    const result = validatePaper({ blueprint, selection, facts });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.map((f) => [f.code, f.number])).toEqual([
      ["not_approved", 1],
      ["no_answer", 2],
      ["answer_not_verified", 3],
      ["asset_missing", 4],
    ]);
    expect(result.failures[2]?.detail).toContain("Expression gives 5");
  });

  it("fails when a question's stored marks differ from what was selected, or it cannot be loaded", () => {
    const selection = goodSelection();
    const facts = goodFacts(selection);
    facts[0] = { ...facts[0]!, marks: 5 };
    expect(codesOf(selection, facts)).toContain("marks_mismatch");
    expect(codesOf(selection, facts.slice(1))).toContain("unknown_question");
  });

  it("the scope report is produced even when validation fails", () => {
    const selection = goodSelection().slice(0, 4);
    const result = validatePaper({ blueprint, selection, facts: goodFacts(selection) });
    expect(result.ok).toBe(false);
    expect(result.scope).toEqual(buildScopeReport(blueprint, selection));
    expect(result.scope.totalMarks).toBe(7);
  });

  it("explains failures to a parent without internal words, and always with a way forward", () => {
    const content = explainPaperFailures([{ code: "answer_not_verified", number: 3, questionId: "q3", detail: "internal detail Q3" }]);
    const structure = explainPaperFailures([{ code: "total_marks", detail: "The questions add up to 19 marks, not 20." }]);
    expect(explainPaperFailures([])).toEqual([]);
    for (const line of [...content, ...structure]) {
      expect(hasBannedParentWording(line)).toBe(false);
      expect(line).not.toMatch(/q3|19|internal|blueprint|question id/i);
    }
    expect(content.join(" ")).toMatch(/Nothing was saved/);
    expect(content.join(" ")).toMatch(/try again/i);
    expect(structure.join(" ")).toMatch(/Try a different number of marks/);
  });
});
