import { describe, expect, it } from "vitest";
import { buildBlueprint } from "@/domain/assessments";
import { workingSpaceFor } from "@/domain/papers";
import {
  STUDENT_INSTRUCTIONS,
  answerInlines,
  buildAnswerPack,
  buildStudentPaper,
  paperTitle,
  type PaperContentQuestion,
} from "@/application/paper-documents";
import type { QuestionContent } from "@/schemas/question-content";
import { renderStudentPaperPdf } from "@/services/pdf";

const blueprint = buildBlueprint({
  curriculumVersionId: "v1",
  level: "P3",
  subject: "Mathematics",
  topics: [{ topicId: "t1", label: "Fractions", outcomeIds: ["o1"] }],
  settings: { totalMarks: 10, durationMinutes: 20, difficulty: "balanced" },
});

const mcqContent: QuestionContent = {
  stem: [{ t: "p", c: [{ t: "text", v: "Which is bigger?" }] }],
  options: (["A", "B", "C", "D"] as const).map((id, i) => ({ id, c: [{ t: "text" as const, v: String((i + 1) * 10) }] })),
};
const plain: QuestionContent = { stem: [{ t: "p", c: [{ t: "text", v: "Work it out." }, { t: "blank" }] }] };

const questions: PaperContentQuestion[] = [
  { number: 2, sectionCode: "A", marks: 2, questionType: "mcq", content: mcqContent, answer: { kind: "mcq", correct: "C" }, workedSolution: [{ t: "p", c: [{ t: "text", v: "WORKED-MCQ" }] }], topicLabel: "Fractions" },
  { number: 1, sectionCode: "A", marks: 3, questionType: "mcq", content: mcqContent, answer: { kind: "mcq", correct: "A" }, workedSolution: [{ t: "p", c: [{ t: "text", v: "WORKED-MCQ-1" }] }], topicLabel: "Fractions" },
  { number: 3, sectionCode: "B", marks: 5, questionType: "number", content: plain, answer: { kind: "number", value: "165", unit: "min" }, workedSolution: [{ t: "p", c: [{ t: "text", v: "WORKED-NUM" }] }], topicLabel: "Fractions" },
];

describe("paper documents (M4-04, M4-05 inputs)", () => {
  it("titles the paper and gives the instructions the parent asked for", () => {
    expect(paperTitle("WA2", 1)).toBe("Mathematics WA2 · Mock 1");
    const paper = buildStudentPaper({ assessmentName: "WA2", mockNumber: 1, blueprint, questions });
    expect(paper.title).toBe("Mathematics WA2 · Mock 1");
    expect(paper.instructions).toEqual(["Answer all questions.", "Write your answers in the spaces provided.", "Calculators are not allowed."]);
    expect(STUDENT_INSTRUCTIONS).toEqual(paper.instructions);
    expect(paper).toMatchObject({ levelLabel: "Primary 3", subjectLabel: "Mathematics", durationMinutes: 20, totalMarks: 10 });
  });

  it("orders questions by number within sections, with section marks in the title", () => {
    const paper = buildStudentPaper({ assessmentName: "WA2", mockNumber: 1, blueprint, questions });
    expect(paper.sections.map((s) => s.title)).toEqual(["Section A (5 marks)", "Section B (5 marks)"]);
    expect(paper.sections.map((s) => s.questions.map((q) => q.number))).toEqual([[1, 2], [3]]);
  });

  it("gives more working space to more marks and none to multiple choice", () => {
    expect(workingSpaceFor("mcq", 5)).toBe("none");
    expect([1, 2, 3, 4, 5].map((m) => workingSpaceFor("number", m))).toEqual(["small", "medium", "large", "large", "large"]);
    const paper = buildStudentPaper({ assessmentName: "WA2", mockNumber: 1, blueprint, questions });
    expect(paper.sections.flatMap((s) => s.questions).map((q) => q.workingSpace)).toEqual(["none", "none", "large"]);
  });

  it("the student paper has no answer, solution or topic data and the renderer accepts it", async () => {
    const paper = buildStudentPaper({ assessmentName: "WA2", mockNumber: 1, blueprint, questions });
    expect(JSON.stringify(paper)).not.toMatch(/WORKED|"correct"|"answer"|"workedSolution"|topicLabel|"165"/);
    const pdf = await renderStudentPaperPdf(paper);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("the answer pack uses the same numbers and marks as the student paper", () => {
    const input = { assessmentName: "WA2", mockNumber: 2, blueprint, questions };
    const paper = buildStudentPaper(input);
    const pack = buildAnswerPack(input);
    expect(pack.title).toBe("Mathematics WA2 · Mock 2");
    const student = paper.sections.flatMap((s) => s.questions).map((q) => [q.number, q.marks]);
    const answers = pack.sections.flatMap((s) => s.questions).map((q) => [q.number, q.marks]);
    expect(answers).toEqual(student);
    expect(pack.sections.flatMap((s) => s.questions).every((q) => q.topicLabel === "Fractions" && !/P3-/.test(q.topicLabel))).toBe(true);
  });

  it("writes each kind of answer the way a parent reads it", () => {
    const flat = (inlines: ReturnType<typeof answerInlines>) => inlines.map((i) => (i.t === "text" ? i.v : i.t === "frac" ? `${i.whole ?? ""}[${i.n}/${i.d}]` : "_")).join("");
    expect(flat(answerInlines({ kind: "mcq", correct: "C" }, mcqContent))).toBe("(3) 30");
    expect(flat(answerInlines({ kind: "number", value: "4.25", unit: "$" }, plain))).toBe("$4.25");
    expect(flat(answerInlines({ kind: "number", value: "165", unit: "min", display: [{ t: "text", v: "2 h 45 min" }] }, plain))).toBe("165 min, or 2 h 45 min");
    expect(flat(answerInlines({ kind: "number", value: "12" }, plain))).toBe("12");
    expect(flat(answerInlines({ kind: "fraction", value: "3/4", acceptEquivalent: true, requireSimplest: false }, plain))).toBe("[3/4]");
    expect(flat(answerInlines({ kind: "fraction", value: "1 1/2", acceptEquivalent: true, requireSimplest: true }, plain))).toBe("1[1/2]");
    expect(flat(answerInlines({ kind: "text", accepted: ["triangle", "a triangle"] }, plain))).toBe("triangle or a triangle");
  });
});
