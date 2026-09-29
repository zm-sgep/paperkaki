import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AnswerSchema,
  InlineSchema,
  QuestionContentSchema,
  QuestionDraftSchema,
} from "@/schemas/question-content";

const dir = path.resolve(import.meta.dirname, "../fixtures/questions");
const load = (name: string): unknown => JSON.parse(readFileSync(path.join(dir, name), "utf8"));
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("QuestionDraftSchema fixtures", () => {
  for (const f of files.filter((f) => f.startsWith("valid-") || f.startsWith("wrong-"))) {
    it(`accepts ${f}`, () => {
      const r = QuestionDraftSchema.safeParse(load(f));
      expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    });
  }
  for (const f of files.filter((f) => f.startsWith("broken-"))) {
    it(`rejects ${f}`, () => {
      expect(QuestionDraftSchema.safeParse(load(f)).success).toBe(false);
    });
  }

  it("covers every question type with a valid fixture", () => {
    const types = new Set(
      files
        .filter((f) => f.startsWith("valid-"))
        .map((f) => (QuestionDraftSchema.parse(load(f))).questionType),
    );
    expect([...types].sort()).toEqual(["fraction", "mcq", "number", "text"]);
  });

  it("explains why an mcq/answer mismatch fails", () => {
    const r = QuestionDraftSchema.safeParse(load("broken-mcq-with-number-answer.json"));
    expect(r.error?.issues.map((i) => i.message).join(" ")).toContain("does not match questionType");
  });
});

describe("content primitives", () => {
  it("validates inlines", () => {
    expect(InlineSchema.safeParse({ t: "text", v: "" }).success).toBe(false);
    expect(InlineSchema.safeParse({ t: "frac", n: 1, d: 0 }).success).toBe(false);
    expect(InlineSchema.safeParse({ t: "frac", n: 1, d: 2, whole: 0 }).success).toBe(false);
    expect(InlineSchema.safeParse({ t: "frac", n: 1, d: 2, whole: 1 }).success).toBe(true);
    expect(InlineSchema.safeParse({ t: "blank" }).success).toBe(true);
    expect(InlineSchema.safeParse({ t: "blank", label: "a" }).success).toBe(true);
  });

  it("rejects an empty stem and an image that is too wide", () => {
    expect(QuestionContentSchema.safeParse({ stem: [] }).success).toBe(false);
    const img = (widthMm: number) => ({ stem: [{ t: "image", assetKey: "k", alt: "a", widthMm }] });
    expect(QuestionContentSchema.safeParse(img(171)).success).toBe(false);
    expect(QuestionContentSchema.safeParse(img(9)).success).toBe(false);
    expect(QuestionContentSchema.safeParse(img(80)).success).toBe(true);
  });

  it("validates answer values", () => {
    const num = (value: string) => AnswerSchema.safeParse({ kind: "number", value }).success;
    expect(num("1250")).toBe(true);
    expect(num("12.50")).toBe(true);
    expect(num("12.")).toBe(false);
    expect(num("1e3")).toBe(false);
    const frac = (value: string) =>
      AnswerSchema.safeParse({ kind: "fraction", value, acceptEquivalent: true, requireSimplest: false }).success;
    expect(frac("3/4")).toBe(true);
    expect(frac("1 1/2")).toBe(true);
    expect(frac("3/0")).toBe(false);
    expect(frac("0.75")).toBe(false);
    expect(AnswerSchema.safeParse({ kind: "text", accepted: [] }).success).toBe(false);
    expect(AnswerSchema.safeParse({ kind: "number", value: "1", unit: "furlong" }).success).toBe(false);
  });
});
