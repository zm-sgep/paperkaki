import { describe, expect, it } from "vitest";
import { previewPaper } from "@/app/dev/mock-preview/fixture";
import { QuestionContentSchema } from "@/schemas/question-content";

describe("Mock Mode preview fixture", () => {
  const paper = previewPaper("t");

  it("has 8 questions with valid structured content and unique ids", () => {
    expect(paper.questions).toHaveLength(8);
    expect(new Set(paper.questions.map((q) => q.id)).size).toBe(8);
    for (const q of paper.questions) expect(() => QuestionContentSchema.parse(q.content), q.id).not.toThrow();
  });

  it("covers multiple choice, a number with a unit, a fraction, a bar graph and working", () => {
    const kinds = paper.questions.map((q) => q.input.kind);
    expect(kinds).toEqual(expect.arrayContaining(["mcq", "number", "fraction", "text"]));
    expect(paper.questions.some((q) => q.input.kind === "number" && q.input.unit)).toBe(true);
    expect(paper.questions.some((q) => q.content.stem.some((b) => b.t === "bargraph"))).toBe(true);
    expect(paper.questions.some((q) => q.working)).toBe(true);
  });

  it("gives every multiple-choice question four options and carries no answers", () => {
    for (const q of paper.questions) {
      if (q.input.kind === "mcq") expect(q.content.options).toHaveLength(4);
      else expect(q.content.options).toBeUndefined();
      expect(JSON.stringify(q)).not.toMatch(/correct|solution|accepted/i);
    }
  });
});
