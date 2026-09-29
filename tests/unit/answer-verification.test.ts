import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  answersEquivalent,
  canonicaliseAnswer,
  evaluateExpression,
  ExpressionError,
  formatRational,
  isSimplestFraction,
  parseRational,
  RationalError,
  tryParseRational,
  verifyQuestionAnswer,
} from "@/domain/questions";
import { QuestionDraftSchema, type Answer, type QuestionDraft } from "@/schemas/question-content";

const ev = (e: string) => formatRational(evaluateExpression(e));

describe("Rational parsing", () => {
  it("normalises decimals, fractions and mixed numbers", () => {
    expect(formatRational(parseRational("12.50"))).toBe("25/2");
    expect(formatRational(parseRational("12.5"))).toBe("25/2");
    expect(formatRational(parseRational("6/8"))).toBe("3/4");
    expect(formatRational(parseRational("1 1/2"))).toBe("3/2");
    expect(formatRational(parseRational("-1 1/2"))).toBe("-3/2");
    expect(formatRational(parseRational("-3"))).toBe("-3");
    expect(formatRational(parseRational("0.05"))).toBe("1/20");
    expect(formatRational(parseRational("  4/2 "))).toBe("2");
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "1/0", "1 2", "1..2", ".5", "1/2/3", "--1", "1,250"]) {
      expect(() => parseRational(bad), bad).toThrow(RationalError);
      expect(tryParseRational(bad)).toBeNull();
    }
  });

  it("handles numbers beyond double precision exactly", () => {
    expect(ev("9007199254740993+1")).toBe("9007199254740994");
  });
});

describe("evaluateExpression", () => {
  it("respects precedence, parentheses and unary minus", () => {
    expect(ev("2+3*4")).toBe("14");
    expect(ev("(2+3)*4")).toBe("20");
    expect(ev("-2+5")).toBe("3");
    expect(ev("10-2-3")).toBe("5");
    expect(ev("2*-3")).toBe("-6");
    expect(ev("100/4/5")).toBe("5");
  });

  it("is exact: 0.1 + 0.2 == 0.3", () => {
    expect(ev("0.1+0.2")).toBe("3/10");
    expect(ev("0.1+0.2")).toBe(ev("0.3"));
  });

  it("treats a/b as division and keeps fractions exact", () => {
    expect(ev("1/4+1/2")).toBe("3/4");
    expect(ev("3/4*4")).toBe("3");
    expect(ev("1/3+1/3+1/3")).toBe("1");
    expect(ev("12.50*2")).toBe("25");
  });

  it("rejects division by zero", () => {
    expect(() => evaluateExpression("1/0")).toThrow(ExpressionError);
    expect(() => evaluateExpression("5/(2-2)")).toThrow(/zero/i);
    expect(() => evaluateExpression("1/0.00")).toThrow(ExpressionError);
  });

  it("rejects malformed expressions", () => {
    for (const bad of ["", "  ", "2+", "*3", "(1+2", "1+2)", "2 3", "1 1/2", "2^3", "1..2", "abc", "1.", "eval(1)", "1+*2"]) {
      expect(() => evaluateExpression(bad), bad).toThrow(ExpressionError);
    }
  });
});

describe("answersEquivalent", () => {
  const fraction = (value: string, acceptEquivalent: boolean, requireSimplest: boolean): Answer => ({
    kind: "fraction",
    value,
    acceptEquivalent,
    requireSimplest,
  });

  it("accepts equivalent fractions when allowed", () => {
    expect(answersEquivalent(fraction("3/4", true, false), "6/8")).toBe(true);
    expect(answersEquivalent(fraction("3/4", true, false), "3/4")).toBe(true);
    expect(answersEquivalent(fraction("3/4", true, false), "3/5")).toBe(false);
  });

  it("rejects non-simplest answers when requireSimplest", () => {
    expect(answersEquivalent(fraction("3/4", true, true), "6/8")).toBe(false);
    expect(answersEquivalent(fraction("3/4", true, true), "3/4")).toBe(true);
    expect(answersEquivalent(fraction("3/2", true, true), "1 1/2")).toBe(true);
    expect(answersEquivalent(fraction("3/2", true, true), "1 3/2")).toBe(false);
  });

  it("requires the same form when equivalence is not accepted", () => {
    expect(answersEquivalent(fraction("3/4", false, false), "6/8")).toBe(false);
    expect(answersEquivalent(fraction("3/4", false, false), "3/4")).toBe(true);
  });

  it("handles mixed numbers", () => {
    expect(answersEquivalent(fraction("1 1/2", true, false), "3/2")).toBe(true);
    expect(answersEquivalent(fraction("1 1/2", true, false), "1 2/4")).toBe(true);
    expect(answersEquivalent(fraction("1 1/2", true, true), "1 2/4")).toBe(false);
    expect(answersEquivalent(fraction("1 1/2", true, false), "1 2")).toBe(false);
  });

  it("compares numbers exactly regardless of trailing zeros", () => {
    const n: Answer = { kind: "number", value: "12.50" };
    expect(answersEquivalent(n, "12.5")).toBe(true);
    expect(answersEquivalent(n, "12.500")).toBe(true);
    expect(answersEquivalent(n, "12.51")).toBe(false);
    expect(answersEquivalent(n, "abc")).toBe(false);
    expect(answersEquivalent(n, "")).toBe(false);
  });

  it("compares text case-insensitively with collapsed spaces", () => {
    const t: Answer = { kind: "text", accepted: ["Ice Cream", "gelato"] };
    expect(answersEquivalent(t, "  ice   cream ")).toBe(true);
    expect(answersEquivalent(t, "GELATO")).toBe(true);
    expect(answersEquivalent(t, "icecream")).toBe(false);
    expect(answersEquivalent(t, "  ")).toBe(false);
  });

  it("compares mcq exactly", () => {
    expect(answersEquivalent({ kind: "mcq", correct: "B" }, "B")).toBe(true);
    expect(answersEquivalent({ kind: "mcq", correct: "B" }, "b")).toBe(false);
    expect(answersEquivalent({ kind: "mcq", correct: "B" }, "C")).toBe(false);
  });

  it("detects simplest form", () => {
    expect(isSimplestFraction("3/4")).toBe(true);
    expect(isSimplestFraction("6/8")).toBe(false);
    expect(isSimplestFraction("7/4")).toBe(true);
    expect(isSimplestFraction("1 1/2")).toBe(true);
    expect(isSimplestFraction("1 3/2")).toBe(false);
    expect(isSimplestFraction("x")).toBe(false);
  });
});

describe("canonicaliseAnswer", () => {
  it("gives equal strings for equal answers", () => {
    expect(canonicaliseAnswer({ kind: "number", value: "12.50" })).toBe(
      canonicaliseAnswer({ kind: "number", value: "12.5" }),
    );
    expect(
      canonicaliseAnswer({ kind: "fraction", value: "6/8", acceptEquivalent: true, requireSimplest: false }),
    ).toBe(canonicaliseAnswer({ kind: "fraction", value: "3/4", acceptEquivalent: true, requireSimplest: false }));
    expect(canonicaliseAnswer({ kind: "text", accepted: ["B  b", "a"] })).toBe(
      canonicaliseAnswer({ kind: "text", accepted: ["A", "b b"] }),
    );
    expect(canonicaliseAnswer({ kind: "mcq", correct: "C" })).toBe("mcq:C");
    expect(canonicaliseAnswer({ kind: "number", value: "5", unit: "cm" })).not.toBe(
      canonicaliseAnswer({ kind: "number", value: "5" }),
    );
  });
});

describe("verifyQuestionAnswer", () => {
  const dir = path.resolve(import.meta.dirname, "../fixtures/questions");
  const fixture = (name: string): QuestionDraft =>
    QuestionDraftSchema.parse(JSON.parse(readFileSync(path.join(dir, name), "utf8")));

  it("passes machine-verifiable valid fixtures", () => {
    for (const f of ["valid-mcq-expression.json", "valid-number.json", "valid-fraction.json"]) {
      expect(verifyQuestionAnswer(fixture(f)), f).toEqual({ ok: true });
    }
  });

  it("flags human-verified questions for a human check", () => {
    for (const f of ["valid-mcq-human.json", "valid-text-with-table.json"]) {
      expect(verifyQuestionAnswer(fixture(f)), f).toEqual({ ok: true, needsHumanCheck: true });
    }
  });

  it("fails an mcq with two correct options", () => {
    const r = verifyQuestionAnswer(fixture("wrong-mcq-two-correct.json"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/A, B all equal/);
  });

  it("fails an mcq whose correct id points to the wrong option", () => {
    const r = verifyQuestionAnswer(fixture("wrong-mcq-wrong-id.json"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/matches option B/);
  });

  it("fails a wrong number and a non-simplest fraction", () => {
    expect(verifyQuestionAnswer(fixture("wrong-number-wrong-value.json")).ok).toBe(false);
    const r = verifyQuestionAnswer(fixture("wrong-fraction-not-simplest.json"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/simplest/);
  });

  it("fails an mcq when no option equals the result or an option is not numeric", () => {
    const base = fixture("valid-mcq-expression.json");
    const noMatch = { ...base, verification: { expression: "1+1" } };
    expect(verifyQuestionAnswer(noMatch).ok).toBe(false);
    const withText = {
      ...base,
      content: {
        ...base.content,
        options: base.content.options?.map((o) => (o.id === "D" ? { ...o, c: [{ t: "text" as const, v: "seven" }] } : o)),
      },
    };
    const r = verifyQuestionAnswer(withText);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/Option D is not purely numeric/);
  });

  it("supports fraction inline options", () => {
    const base = fixture("valid-mcq-expression.json");
    const draft: QuestionDraft = {
      ...base,
      verification: { expression: "1/4+1/2" },
      answer: { kind: "mcq", correct: "C" },
      content: {
        ...base.content,
        options: [
          { id: "A", c: [{ t: "frac", n: 1, d: 4 }] },
          { id: "B", c: [{ t: "frac", n: 2, d: 6 }] },
          { id: "C", c: [{ t: "frac", n: 3, d: 4 }] },
          { id: "D", c: [{ t: "text", v: "1" }] },
        ],
      },
    };
    expect(verifyQuestionAnswer(draft)).toEqual({ ok: true });
  });

  it("reports division by zero and malformed expressions instead of throwing", () => {
    const base = fixture("valid-number.json");
    for (const expression of ["1/0", "1+", "abc"]) {
      const r = verifyQuestionAnswer({ ...base, verification: { expression } });
      expect(r.ok, expression).toBe(false);
    }
  });

  it("compares decimals with trailing zeros exactly", () => {
    const base = fixture("valid-number.json");
    expect(verifyQuestionAnswer({ ...base, answer: { kind: "number", value: "15.750" } })).toEqual({ ok: true });
  });
});

describe("content/questions bank", () => {
  const dir = path.resolve(import.meta.dirname, "../../content/questions");
  for (const file of ["p3-maths-number.json", "p3-maths-fmt.json"]) {
    describe(file, () => {
      const items = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as unknown[];
      it("has items", () => expect(items.length).toBeGreaterThan(0));
      it("every item parses and verifies", () => {
        const failures: string[] = [];
        items.forEach((raw, i) => {
          const parsed = QuestionDraftSchema.safeParse(raw);
          if (!parsed.success) {
            failures.push(`#${i} schema: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
            return;
          }
          const r = verifyQuestionAnswer(parsed.data);
          if (!r.ok) failures.push(`#${i} ${parsed.data.familyCode} verify: ${r.reasons.join("; ")}`);
          if ("human" in parsed.data.verification && r.ok !== true) failures.push(`#${i} human item not ok`);
          if ("human" in parsed.data.verification && r.ok && !r.needsHumanCheck) failures.push(`#${i} missing needsHumanCheck`);
        });
        expect(failures).toEqual([]);
      });
    });
  }
});
