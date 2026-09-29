import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerView } from "@/components/paper/AnswerView";
import { QuestionView } from "@/components/paper/QuestionView";
import { QuestionDraftSchema, type QuestionDraft } from "@/schemas/question-content";
import { parseQuestionFilters, questionListHref } from "@/schemas/question-admin";

const contentDir = path.resolve(import.meta.dirname, "../../content/questions");
const bank = ["p3-maths-number.json", "p3-maths-fmt.json", "p3-maths-gaps.json", "p3-maths-diagrams.json", "p3-maths-topup-number.json", "p3-maths-topup-mgs.json"].flatMap((f) =>
  (JSON.parse(readFileSync(path.join(contentDir, f), "utf8")) as unknown[]).map((q) => QuestionDraftSchema.parse(q)),
);
const render = (q: QuestionDraft, extra = {}) => renderToStaticMarkup(createElement(QuestionView, { content: q.content, marks: q.marks, ...extra }));
const byFamily = (code: string) => bank.find((q) => q.familyCode === code) as QuestionDraft;

describe("QuestionView (HTML preview)", () => {
  it("renders every question in the bank without throwing, and never shows the answer or solution", () => {
    for (const q of bank) {
      const html = render(q);
      expect(html, q.familyCode).toContain("data-question-view");
      expect(html, q.familyCode).not.toContain("Worked solution");
      expect(html, q.familyCode).not.toContain("data-answer-view");
    }
  });

  it("draws stacked fractions with the numerator over the denominator, and a whole number for mixed numbers", () => {
    const html = render(byFamily("P3-NA-FR-F01"));
    expect(html).toContain("data-fraction");
    const q: QuestionDraft = {
      ...byFamily("P3-NA-FR-F01"),
      content: { stem: [{ t: "p", c: [{ t: "frac", n: 1, d: 2, whole: 3 }] }] },
    };
    const mixed = render(q);
    expect(mixed).toMatch(/<span class="mr-0.5">3<\/span>/);
    expect(mixed).toContain("1 over 2");
  });

  it("renders multiple-choice options A to D", () => {
    const html = render(byFamily("P3-NA-WN-F01"));
    expect(html).toContain("data-options");
    for (const id of ["(A)", "(B)", "(C)", "(D)"]) expect(html).toContain(id);
  });

  it("renders tables with a header row", () => {
    const q: QuestionDraft = {
      ...byFamily("P3-NA-WN-F01"),
      content: {
        stem: [
          {
            t: "table",
            header: true,
            rows: [
              [[{ t: "text", v: "Day" }], [{ t: "text", v: "Cups" }]],
              [[{ t: "text", v: "Mon" }], [{ t: "text", v: "20" }]],
            ],
          },
        ],
      },
    };
    const html = render(q);
    expect(html).toContain("<thead");
    expect(html).toContain('scope="col"');
    expect(html).toContain("<td");
  });

  it("shows a labelled placeholder for an image without a signed link, and never a stored URL", () => {
    const q: QuestionDraft = {
      ...byFamily("P3-NA-WN-F01"),
      content: { stem: [{ t: "image", assetKey: "questions/a.png", alt: "A blue box" }] },
    };
    expect(render(q)).toContain("[Image: A blue box]");
    const signed = render(q, { imageUrls: { "questions/a.png": "/api/files/question-assets/questions/a.png?exp=1&sig=x" } });
    expect(signed).toContain("<img");
  });

  it("draws every diagram type as inline SVG", () => {
    const seen = new Set<string>();
    for (const q of bank) {
      const html = render(q);
      for (const type of ["bargraph", "grid", "angle", "lines"]) {
        if (html.includes(`data-diagram="${type}"`)) {
          seen.add(type);
          expect(html).toContain("<svg");
        }
      }
    }
    expect([...seen].sort()).toEqual(["angle", "bargraph", "grid", "lines"]);
  });

  it("keeps diagram descriptions free of answers: no angle size, no square count", () => {
    for (const q of bank) {
      const html = render(q);
      const angleLabels = [...html.matchAll(/aria-label="(Angle [^"]*|An angle)"/g)].map((m) => m[1]);
      for (const label of angleLabels) expect(label).not.toMatch(/\d/);
      for (const m of html.matchAll(/aria-label="(A square grid[^"]*)"/g)) expect(m[1]).not.toMatch(/\d/);
    }
  });

  it("draws a bar graph to the same layout as the PDF: one rectangle per bar", () => {
    const q = byFamily("P3-ST-BG-F03");
    const stem = q.content.stem.find((b) => b.t === "bargraph");
    if (stem?.t !== "bargraph") throw new Error("expected a bar graph");
    const html = render(q);
    expect((html.match(/<rect/g) ?? []).length).toBe(stem.bars.length);
  });
});

describe("AnswerView", () => {
  it("shows the answer and the worked solution", () => {
    const q = byFamily("P3-NA-WN-F01");
    const html = renderToStaticMarkup(createElement(AnswerView, { answer: q.answer, content: q.content, workedSolution: q.workedSolution }));
    expect(html).toContain("Answer:");
    expect(html).toContain("Option B");
    expect(html).toContain("Worked solution");
  });
});

describe("question list filter parameters", () => {
  const uuid = "2f0f6d9e-3b1c-4c57-9d2a-0f4a1e8f6b11";

  it("reads valid values and ignores invalid ones", () => {
    expect(parseQuestionFilters({ level: "P3", topic: uuid, outcome: "nope", type: "mcq", difficulty: "hard", status: "approved", page: "3" })).toEqual({
      filters: { level: "P3", topicId: uuid, questionType: "mcq", status: "approved" },
      page: 3,
    });
    expect(parseQuestionFilters({ page: "-2" }).page).toBe(1);
    expect(parseQuestionFilters({ level: ["P3", "P4"] }).filters.level).toBe("P3");
    expect(parseQuestionFilters({})).toEqual({ filters: {}, page: 1 });
  });

  it("builds links that round-trip", () => {
    const filters = { level: "P3", topicId: uuid, difficulty: "basic" as const };
    const href = questionListHref(filters, 2);
    expect(href).toBe(`/admin/questions?level=P3&topic=${uuid}&difficulty=basic&page=2`);
    const query = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseQuestionFilters(query)).toEqual({ filters, page: 2 });
    expect(questionListHref({})).toBe("/admin/questions");
  });
});
