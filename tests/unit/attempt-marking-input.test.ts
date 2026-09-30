import { describe, expect, it } from "vitest";
import { markingResponseFor, planQuestionInput, shownUnitOf, type SavedAnswer } from "@/domain/attempts";
import { markQuestion } from "@/domain/marking";
import type { MarkableQuestion } from "@/domain/marking";

const blank: SavedAnswer = { selectedOption: null, typedAnswer: null, typedUnit: null, hasStrokes: false };

describe("markingResponseFor", () => {
  it("treats a missing or empty answer as blank", () => {
    expect(markingResponseFor(undefined)).toEqual({});
    expect(markingResponseFor(blank)).toMatchObject({ selectedOption: undefined, typedAnswer: undefined, hasHandwriting: false });
    expect(markingResponseFor({ ...blank, typedAnswer: "   " }).typedAnswer).toBeUndefined();
  });

  it("passes the unit beside the box only when the child typed a bare number", () => {
    expect(markingResponseFor({ ...blank, typedAnswer: "340", typedUnit: "cm" }).typedUnit).toBe("cm");
    expect(markingResponseFor({ ...blank, typedAnswer: "$12.50", typedUnit: "$" }).typedUnit).toBeUndefined();
    expect(markingResponseFor({ ...blank, typedAnswer: "340 cm", typedUnit: "cm" }).typedUnit).toBeUndefined();
    expect(markingResponseFor({ ...blank, typedAnswer: "1 m 20 cm", typedUnit: "cm" }).typedUnit).toBeUndefined();
    expect(markingResponseFor({ ...blank, typedAnswer: "abc", typedUnit: "cm" }).typedUnit).toBeUndefined();
  });

  it("ignores an option that is not A to D and carries working through", () => {
    expect(markingResponseFor({ ...blank, selectedOption: "E" }).selectedOption).toBeUndefined();
    expect(markingResponseFor({ ...blank, selectedOption: "C", hasStrokes: true })).toMatchObject({ selectedOption: "C", hasHandwriting: true });
  });

  it("marks a bare number with the shown unit as correct, and a compound answer as typed", () => {
    const question: MarkableQuestion = {
      id: "q",
      questionType: "number",
      marks: 2,
      answer: { kind: "number", value: "340", unit: "cm" },
      markingScheme: { method: "exact_with_unit" },
    };
    const bare = markQuestion(question, markingResponseFor({ ...blank, typedAnswer: "340", typedUnit: "cm" }));
    expect(bare).toMatchObject({ score: 2, reviewRequired: false });
    const compound = markQuestion(question, markingResponseFor({ ...blank, typedAnswer: "3 m 40 cm", typedUnit: "cm" }));
    expect(compound).toMatchObject({ score: 2, reviewRequired: false });
  });
});

describe("planQuestionInput", () => {
  it("picks the answer control from the question, and the unit from its answer", () => {
    expect(planQuestionInput({ questionType: "mcq", marks: 1, answer: { kind: "mcq", correct: "A" } })).toEqual({ input: { kind: "mcq" }, working: "optional" });
    expect(planQuestionInput({ questionType: "number", marks: 2, answer: { kind: "number", value: "3", unit: "cm" } })).toEqual({ input: { kind: "number", unit: "cm" }, working: "required" });
    expect(planQuestionInput({ questionType: "number", marks: 1, answer: { kind: "number", value: "3" } }).input).toEqual({ kind: "number" });
    expect(planQuestionInput({ questionType: "fraction", marks: 2, answer: { kind: "fraction", value: "1/2", acceptEquivalent: true, requireSimplest: false } }).input).toEqual({ kind: "fraction" });
    expect(planQuestionInput({ questionType: "text", marks: 2, answer: { kind: "text", accepted: ["x"] } }).input).toEqual({ kind: "text" });
    expect(planQuestionInput({ questionType: "number", marks: 4, answer: { kind: "number", value: "3" } }).working).toBe("required");
  });

  it("shows only a stated unit", () => {
    expect(shownUnitOf({ kind: "number", value: "3", unit: "kg" })).toBe("kg");
    expect(shownUnitOf({ kind: "number", value: "3" })).toBeUndefined();
    expect(shownUnitOf({ kind: "mcq", correct: "A" })).toBeUndefined();
  });
});
