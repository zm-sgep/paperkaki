import { describe, expect, it } from "vitest";
import {
  CHILD_REVIEW_MESSAGE,
  markAttempt,
  markQuestion,
  normaliseUnit,
  parseNumberText,
  unitPenaltyScore,
  type MarkableQuestion,
  type MarkingResponse,
} from "@/domain/marking";
import type { Answer } from "@/schemas/question-content";

function q(answer: Answer, marks = 1, method: "exact" | "exact_with_unit" = "exact", id = "q1"): MarkableQuestion {
  return { id, questionType: answer.kind, marks, answer, markingScheme: { method } };
}

function number(value: string, marks = 1, unit?: "cm" | "kg" | "g" | "ml" | "l" | "min" | "h" | "m" | "km" | "$", method: "exact" | "exact_with_unit" = "exact") {
  const answer: Answer = unit ? { kind: "number", value, unit } : { kind: "number", value };
  return q(answer, marks, method);
}

const typed = (typedAnswer: string, rest: Partial<MarkingResponse> = {}): MarkingResponse => ({ typedAnswer, ...rest });

describe("markQuestion: multiple choice", () => {
  const mcq = q({ kind: "mcq", correct: "B" }, 2);
  it("full marks for the right option, 0 for a wrong one", () => {
    expect(markQuestion(mcq, { selectedOption: "B" })).toMatchObject({ score: 2, maxScore: 2, method: "deterministic", confidence: "high", reviewRequired: false });
    expect(markQuestion(mcq, { selectedOption: "C" })).toMatchObject({ score: 0, maxScore: 2, confidence: "high", reviewRequired: false });
  });
  it("blank is 0 with high confidence", () => {
    expect(markQuestion(mcq, {})).toMatchObject({ score: 0, method: "deterministic", confidence: "high", reviewRequired: false });
  });
  it("typed text on a multiple-choice question is checked by a person", () => {
    expect(markQuestion(mcq, typed("B"))).toMatchObject({ method: "needs_review", reviewRequired: true });
  });
});

describe("markQuestion: numbers", () => {
  it("compares exactly and leniently", () => {
    const question = number("1250");
    for (const given of ["1250", " 1250 ", "1,250", "1250.0", "1250.00"]) {
      expect(markQuestion(question, typed(given)), given).toMatchObject({ score: 1, method: "deterministic" });
    }
    expect(markQuestion(question, typed("1251"))).toMatchObject({ score: 0, method: "deterministic", confidence: "high" });
  });

  it("accepts money with or without the dollar sign", () => {
    const question = number("12.5");
    for (const given of ["$12.50", "12.50", "12.5", "$ 12.5", "12.50 dollars"]) {
      expect(markQuestion(question, typed(given)).score, given).toBe(1);
    }
    expect(markQuestion(number("1250.5"), typed("$1,250.50")).score).toBe(1);
  });

  it("ignores trailing unit words when units are not assessed", () => {
    const question = number("5", 1, "cm");
    for (const given of ["5", "5 cm", "5cm", "5 CM", "5 centimetres", "5 cm."]) {
      expect(markQuestion(question, typed(given)).score, given).toBe(1);
    }
  });

  it("accepts every spelling of litres, kilograms, millilitres and minutes", () => {
    expect(markQuestion(number("3", 1, "l"), typed("3 ℓ")).score).toBe(1);
    expect(markQuestion(number("3", 1, "l"), typed("3l")).score).toBe(1);
    expect(markQuestion(number("3", 1, "l"), typed("3 L")).score).toBe(1);
    expect(markQuestion(number("250", 1, "ml"), typed("250 mℓ")).score).toBe(1);
    expect(markQuestion(number("2", 1, "kg"), typed("2 kg")).score).toBe(1);
    expect(markQuestion(number("45", 1, "min"), typed("45 min")).score).toBe(1);
  });

  it("reads a separate unit field", () => {
    const question = number("5", 2, "cm", "exact_with_unit");
    expect(markQuestion(question, typed("5", { typedUnit: "cm" })).score).toBe(2);
    expect(markQuestion(question, typed("5 cm", { typedUnit: "cm" })).score).toBe(2);
    expect(markQuestion(question, typed("5 cm", { typedUnit: "kg" })).method).toBe("needs_review");
    expect(markQuestion(question, typed("5", { typedUnit: "apples" })).method).toBe("needs_review");
  });

  describe("exact_with_unit", () => {
    it("takes one mark off a missing or wrong unit when marks >= 2", () => {
      const two = number("5", 2, "cm", "exact_with_unit");
      expect(markQuestion(two, typed("5 cm"))).toMatchObject({ score: 2, method: "deterministic" });
      expect(markQuestion(two, typed("5"))).toMatchObject({ score: 1, maxScore: 2, method: "deterministic", confidence: "high" });
      expect(markQuestion(two, typed("5 kg"))).toMatchObject({ score: 1, method: "deterministic" });
      const four = number("5", 4, "cm", "exact_with_unit");
      expect(markQuestion(four, typed("5")).score).toBe(3);
    });
    it("gives 0 for a missing unit on a 1-mark question", () => {
      const one = number("5", 1, "cm", "exact_with_unit");
      expect(markQuestion(one, typed("5")).score).toBe(0);
      expect(markQuestion(one, typed("5 m")).score).toBe(0);
      expect(markQuestion(one, typed("5 cm")).score).toBe(1);
    });
    it("does not rescue a wrong number", () => {
      expect(markQuestion(number("5", 2, "cm", "exact_with_unit"), typed("6 cm")).score).toBe(0);
    });
    it("unitPenaltyScore documents the rule", () => {
      expect([1, 2, 3, 5].map(unitPenaltyScore)).toEqual([0, 1, 2, 4]);
    });
    it("needs a dollar sign for money when the unit is assessed", () => {
      const money = number("12.5", 2, "$", "exact_with_unit");
      expect(markQuestion(money, typed("$12.50")).score).toBe(2);
      expect(markQuestion(money, typed("12.50")).score).toBe(1);
    });
    it("without an expected unit, units are not assessed", () => {
      expect(markQuestion(number("5", 2, undefined, "exact_with_unit"), typed("5")).score).toBe(2);
    });
  });

  describe("compound measures", () => {
    it("accepts kg and g, converted to the expected unit", () => {
      const kg = number("1.25", 2, "kg", "exact_with_unit");
      expect(markQuestion(kg, typed("1 kg 250 g"))).toMatchObject({ score: 2, method: "deterministic" });
      expect(markQuestion(kg, typed("1kg250g")).score).toBe(2);
      expect(markQuestion(kg, typed("1 kg 200 g")).score).toBe(0);
      const g = number("1250", 2, "g", "exact_with_unit");
      expect(markQuestion(g, typed("1 kg 250 g")).score).toBe(2);
    });
    it("accepts h and min, m and cm, l and ml", () => {
      expect(markQuestion(number("135", 2, "min", "exact_with_unit"), typed("2 h 15 min")).score).toBe(2);
      expect(markQuestion(number("2.15", 2, "h", "exact_with_unit"), typed("2 h 15 min")).method).toBe("deterministic");
      expect(markQuestion(number("2.15", 2, "h", "exact_with_unit"), typed("2 h 15 min")).score).toBe(0);
      expect(markQuestion(number("1.35", 2, "m", "exact_with_unit"), typed("1 m 35 cm")).score).toBe(2);
      expect(markQuestion(number("2500", 2, "ml", "exact_with_unit"), typed("2 ℓ 500 mℓ")).score).toBe(2);
    });
    it("also works when units are not assessed", () => {
      expect(markQuestion(number("1.25", 2, "kg"), typed("1 kg 250 g")).score).toBe(2);
    });
    it("is not guessed when the parts do not fit", () => {
      const kg = number("1.25", 2, "kg", "exact_with_unit");
      for (const given of ["250 g 1 kg", "1 kg 1 kg", "1 kg 250 ml", "1 kg 250", "1 250 g"]) {
        expect(markQuestion(kg, typed(given)).method, given).toBe("needs_review");
      }
      expect(markQuestion(number("5", 2), typed("1 kg 250 g")).method).toBe("needs_review");
    });
  });

  it("sends the same quantity in another unit to a person", () => {
    const kg = number("1.25", 2, "kg", "exact_with_unit");
    expect(markQuestion(kg, typed("1250 g"))).toMatchObject({ method: "needs_review", reviewRequired: true });
  });

  it("never guesses at unreadable input", () => {
    const question = number("12.5");
    for (const given of ["twelve", "12,50", "1 250", ".5", "12 apples", "1/2", "12..5", "--3", "12abc"]) {
      const result = markQuestion(question, typed(given));
      expect(result, given).toMatchObject({ method: "needs_review", confidence: "low", reviewRequired: true, score: 0 });
      expect(result.childMessage).toBe(CHILD_REVIEW_MESSAGE);
    }
  });

  it("handles negative answers", () => {
    expect(markQuestion(number("-3"), typed("-3")).score).toBe(1);
    expect(markQuestion(number("-3"), typed("−3")).score).toBe(1);
    expect(markQuestion(number("-3"), typed("3")).score).toBe(0);
  });

  it("blank input is 0 and confident, including whitespace only", () => {
    for (const response of [{}, typed(""), typed("   "), { typedUnit: "cm" }]) {
      expect(markQuestion(number("5"), response)).toMatchObject({ score: 0, method: "deterministic", confidence: "high", reviewRequired: false });
    }
  });
});

describe("markQuestion: word problems (marks >= 3)", () => {
  const word = number("48", 3);
  it("a correct final answer earns full marks, working or not", () => {
    expect(markQuestion(word, typed("48"))).toMatchObject({ score: 3, method: "deterministic" });
    expect(markQuestion(word, typed("48", { hasHandwriting: true })).score).toBe(3);
  });
  it("a wrong answer with handwriting goes to review", () => {
    const result = markQuestion(word, typed("40", { hasHandwriting: true }));
    expect(result).toMatchObject({ method: "needs_review", confidence: "low", reviewRequired: true, score: 0, maxScore: 3 });
    expect(result.childMessage).toBe("We need a quick check on this one.");
  });
  it("a wrong answer with no working is 0 and confident", () => {
    expect(markQuestion(word, typed("40"))).toMatchObject({ score: 0, method: "deterministic", confidence: "high" });
    expect(markQuestion(word, typed("40", { hasHandwriting: false })).method).toBe("deterministic");
  });
  it("a blank answer with working shown goes to review; without it, 0", () => {
    expect(markQuestion(word, { hasHandwriting: true }).method).toBe("needs_review");
    expect(markQuestion(word, {}).method).toBe("deterministic");
  });
  it("working on a short question does not trigger review", () => {
    expect(markQuestion(number("48", 2), typed("40", { hasHandwriting: true })).method).toBe("deterministic");
  });
});

describe("markQuestion: fractions", () => {
  const fraction = (value: string, acceptEquivalent: boolean, requireSimplest: boolean, marks = 1) =>
    q({ kind: "fraction", value, acceptEquivalent, requireSimplest }, marks);

  it("accepts 3/4, spacing and mixed numbers", () => {
    expect(markQuestion(fraction("3/4", false, false), typed("3/4")).score).toBe(1);
    expect(markQuestion(fraction("3/4", false, false), typed(" 3 / 4 ")).score).toBe(1);
    expect(markQuestion(fraction("1 1/2", false, false), typed("1 1/2")).score).toBe(1);
    expect(markQuestion(fraction("1 1/2", false, false), typed("1   1 / 2")).score).toBe(1);
  });
  it("equivalents count only when allowed", () => {
    expect(markQuestion(fraction("1/2", true, false), typed("2/4")).score).toBe(1);
    expect(markQuestion(fraction("1/2", false, false), typed("2/4"))).toMatchObject({ score: 0, method: "deterministic" });
  });
  it("applies the simplest-form rule", () => {
    const simplest = fraction("1/2", true, true);
    expect(markQuestion(simplest, typed("1/2")).score).toBe(1);
    const unsimplified = markQuestion(simplest, typed("2/4"));
    expect(unsimplified).toMatchObject({ score: 0, method: "deterministic" });
    expect(unsimplified.reason).toMatch(/simplest/);
    expect(markQuestion(fraction("3/2", true, true), typed("1 1/2")).score).toBe(1);
    expect(markQuestion(fraction("3/2", true, true), typed("6/4")).score).toBe(0);
  });
  it("a different fraction is wrong, confidently", () => {
    expect(markQuestion(fraction("3/4", true, true), typed("2/3"))).toMatchObject({ score: 0, confidence: "high" });
  });
  it("a decimal or words for a fraction question is checked by a person", () => {
    for (const given of ["0.75", "three quarters", "3/0", "3/4 kg"]) {
      expect(markQuestion(fraction("3/4", true, true), typed(given)).method, given).toBe("needs_review");
    }
  });
  it("blank is 0", () => {
    expect(markQuestion(fraction("3/4", true, true), typed(" "))).toMatchObject({ score: 0, confidence: "high" });
  });
  it("follows the word-problem rule", () => {
    const three = fraction("3/4", true, true, 3);
    expect(markQuestion(three, typed("2/3", { hasHandwriting: true })).method).toBe("needs_review");
    expect(markQuestion(three, typed("2/3")).method).toBe("deterministic");
    expect(markQuestion(three, typed("3/4")).score).toBe(3);
  });
});

describe("markQuestion: text", () => {
  const text = q({ kind: "text", accepted: ["Square", "a square"] }, 1);
  it("matches case- and space-insensitively", () => {
    for (const given of ["square", "  SQUARE ", "A   Square"]) {
      expect(markQuestion(text, typed(given)), given).toMatchObject({ score: 1, method: "deterministic", confidence: "high" });
    }
  });
  it("anything else needs review, never a guess", () => {
    expect(markQuestion(text, typed("rectangle"))).toMatchObject({ score: 0, method: "needs_review", confidence: "low", reviewRequired: true, childMessage: CHILD_REVIEW_MESSAGE });
  });
  it("blank is 0 with high confidence", () => {
    expect(markQuestion(text, {})).toMatchObject({ score: 0, method: "deterministic", confidence: "high" });
  });
});

describe("decision shape", () => {
  it("only review decisions carry a child message, and it never has a number in it", () => {
    const decisions = [
      markQuestion(number("5"), typed("5")),
      markQuestion(number("5"), typed("x")),
      markQuestion(q({ kind: "text", accepted: ["a"] }), typed("b")),
    ];
    for (const d of decisions) {
      expect(d.reviewRequired).toBe(d.method === "needs_review");
      expect(d.confidence).toBe(d.method === "needs_review" ? "low" : "high");
      expect(d.reason).not.toBe("");
      if (d.reviewRequired) {
        expect(d.childMessage).toMatch(/^[^0-9]*$/);
      } else {
        expect(d.childMessage).toBeUndefined();
      }
    }
  });
  it("is deterministic and does not change its input", () => {
    const question = number("1.25", 2, "kg", "exact_with_unit");
    const response = typed("1 kg 250 g");
    const before = structuredClone({ question, response });
    expect(markQuestion(question, response)).toEqual(markQuestion(question, response));
    expect({ question, response }).toEqual(before);
  });
});

describe("markAttempt", () => {
  const questions: MarkableQuestion[] = [
    q({ kind: "mcq", correct: "A" }, 1, "exact", "a"),
    { ...number("12.5", 2), id: "b" },
    { ...number("48", 3), id: "c" },
    { ...q({ kind: "text", accepted: ["cube"] }, 1), id: "d" },
    { ...number("7", 2), id: "e" },
  ];

  it("returns per-question decisions in order, with totals", () => {
    const result = markAttempt(questions, {
      a: { selectedOption: "A" },
      b: typed("$12.50"),
      c: typed("40", { hasHandwriting: true }),
      d: typed("cuboid"),
      // e left blank
    });
    expect(result.results.map((r) => r.questionId)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.results.map((r) => r.decision.score)).toEqual([1, 2, 0, 0, 0]);
    expect(result.results.map((r) => r.decision.method)).toEqual([
      "deterministic",
      "deterministic",
      "needs_review",
      "needs_review",
      "deterministic",
    ]);
    expect(result.totals).toEqual({ score: 3, maxScore: 9, reviewCount: 2 });
  });

  it("handles an empty attempt and rejects duplicate question ids", () => {
    expect(markAttempt([], {}).totals).toEqual({ score: 0, maxScore: 0, reviewCount: 0 });
    expect(() => markAttempt([questions[0]!, questions[0]!], {})).toThrow(/Duplicate/);
  });

  it("scores full marks for a perfect attempt", () => {
    const result = markAttempt(questions, {
      a: { selectedOption: "A" },
      b: typed("12.5"),
      c: typed("48"),
      d: typed("Cube"),
      e: typed("7"),
    });
    expect(result.totals).toEqual({ score: 9, maxScore: 9, reviewCount: 0 });
  });
});

describe("parseNumberText and normaliseUnit", () => {
  it("parses segments", () => {
    const r = parseNumberText("1 kg 250 g");
    expect(r.ok && r.segments.map((s) => s.unit)).toEqual(["kg", "g"]);
    expect(parseNumberText("$12.50")).toMatchObject({ ok: true });
    expect(parseNumberText("12,50").ok).toBe(false);
  });
  it("normalises unit words", () => {
    expect(normaliseUnit("ℓ")).toBe("l");
    expect(normaliseUnit("Litres")).toBe("l");
    expect(normaliseUnit("MIN")).toBe("min");
    expect(normaliseUnit("hrs")).toBe("h");
    expect(normaliseUnit("apples")).toBeNull();
  });
});
