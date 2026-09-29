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

// Two topics, 20 marks: Section A = 5 marks (3 + 2), Section B = 15 marks (7 + 8).
const blueprint = buildBlueprint({
  curriculumVersionId: "v1",
  level: "P3",
  subject: "Mathematics",
  topics: [
    { topicId: "t1", label: "Fractions", outcomeIds: ["o1"] },
    { topicId: "t2", label: "Money", outcomeIds: ["o2"] },
  ],
  settings: { totalMarks: 20, durationMinutes: 25, difficulty: "balanced" },
});

function pick(over: Partial<SelectedQuestion> & { questionId: string; number: number }): SelectedQuestion {
  return { sectionCode: "A", topicId: "t1", marks: 1, difficulty: "standard", ...over };
}

/** Marks that meet the design exactly: t1 = 10 (A3, B7), t2 = 10 (A2, B8). */
function goodSelection(): SelectedQuestion[] {
  return [
    pick({ questionId: "q1", number: 1, topicId: "t1", sectionCode: "A", marks: 2 }),
    pick({ questionId: "q2", number: 2, topicId: "t1", sectionCode: "A", marks: 1 }),
    pick({ questionId: "q3", number: 3, topicId: "t2", sectionCode: "A", marks: 2 }),
    pick({ questionId: "q4", number: 4, topicId: "t1", sectionCode: "B", marks: 3 }),
    pick({ questionId: "q5", number: 5, topicId: "t1", sectionCode: "B", marks: 4 }),
    pick({ questionId: "q6", number: 6, topicId: "t2", sectionCode: "B", marks: 4 }),
    pick({ questionId: "q7", number: 7, topicId: "t2", sectionCode: "B", marks: 4 }),
  ];
}

const goodFacts = (selection: readonly SelectedQuestion[]): PaperQuestionFacts[] =>
  selection.map((q) => ({
    questionId: q.questionId,
    approved: true,
    marks: q.marks,
    hasAnswer: true,
    answerVerified: true,
    verificationReasons: [],
    missingAssets: [],
  }));

describe("validatePaper (M4-03)", () => {
  it("the design used here is what the test assumes", () => {
    expect(blueprint.scope.map((s) => s.sectionMarks)).toEqual([
      { A: 3, B: 7 },
      { A: 2, B: 8 },
    ]);
  });

  it("accepts a paper that meets the design and builds a scope report per topic", () => {
    const selection = goodSelection();
    const result = validatePaper({ blueprint, selection, facts: goodFacts(selection) });
    expect(result.ok).toBe(true);
    expect(result.scope.totalMarks).toBe(20);
    expect(result.scope.topics).toEqual([
      { topicId: "t1", label: "Fractions", targetMarks: 10, actualMarks: 10, questionCount: 4 },
      { topicId: "t2", label: "Money", targetMarks: 10, actualMarks: 10, questionCount: 3 },
    ]);
    expect(result.scope.sections).toEqual([
      { code: "A", marks: 5, questionCount: 3 },
      { code: "B", marks: 15, questionCount: 4 },
    ]);
  });

  const codesOf = (selection: SelectedQuestion[], facts = goodFacts(selection)) => {
    const result = validatePaper({ blueprint, selection, facts });
    return result.ok ? [] : result.failures.map((f) => f.code);
  };

  it("fails on inexact total marks", () => {
    const selection = goodSelection();
    selection[6] = { ...selection[6]!, marks: 3 };
    expect(codesOf(selection)).toContain("total_marks");
  });

  it("fails when a topic or a section misses its marks", () => {
    const selection = goodSelection();
    // Move 1 mark from t1's B to t2's B: the total still adds up, but both topics are off.
    selection[4] = { ...selection[4]!, marks: 3 };
    selection[5] = { ...selection[5]!, marks: 5 };
    const codes = codesOf(selection);
    expect(codes).toContain("topic_marks");
    expect(codes).not.toContain("total_marks");
  });

  it("fails when a question is outside the confirmed scope", () => {
    const selection = goodSelection();
    selection[0] = { ...selection[0]!, topicId: "elsewhere" };
    expect(codesOf(selection)).toContain("topic_marks");
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
    unknown[0] = { ...unknown[0]!, sectionCode: "C" as "A" };
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
    expect(result.scope.totalMarks).toBe(8);
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
