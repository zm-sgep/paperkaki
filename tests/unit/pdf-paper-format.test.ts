import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildAnswerPack, buildStudentPaper, type PaperContentQuestion } from "@/application/paper-documents";
import { END_OF_YEAR_COMMON_FORMAT, buildBlueprint, type PaperFormat } from "@/domain/assessments";
import type { QuestionContent } from "@/schemas/question-content";
import { renderAnswerPackPdf, renderStudentPaperPdf } from "@/services/pdf";
import { extractPdfText, type ExtractedPdf } from "../helpers/pdf-text";

const outDir = path.resolve(import.meta.dirname, "../output");

const stem = (v: string): QuestionContent => ({ stem: [{ t: "p", c: [{ t: "text", v }] }] });
const mcq = (v: string): QuestionContent => ({
  stem: [{ t: "p", c: [{ t: "text", v }] }],
  options: (["A", "B", "C", "D"] as const).map((id, i) => ({ id, c: [{ t: "text" as const, v: String((i + 1) * 3) }] })),
});

/** Questions for a format, numbered 1..N across the parts, with distinctive answer tokens. */
function questionsFor(format: PaperFormat): PaperContentQuestion[] {
  const out: PaperContentQuestion[] = [];
  let number = 0;
  format.sections.forEach((section, index) => {
    const code = String.fromCharCode(65 + index);
    for (let i = 0; i < section.questionCount; i += 1) {
      number += 1;
      // Marks add up exactly: spread the extra marks over the first questions.
      const base = Math.floor(section.totalMarks / section.questionCount);
      const extra = i < section.totalMarks - base * section.questionCount ? 1 : 0;
      out.push({
        number,
        sectionCode: code,
        marks: base + extra,
        questionType: section.kind === "mcq" ? "mcq" : "number",
        content: section.kind === "mcq" ? mcq(`Question text ${number}`) : stem(`Question text ${number}`),
        answer: section.kind === "mcq" ? { kind: "mcq", correct: "A" } : { kind: "number", value: String(number) },
        workedSolution: [{ t: "p", c: [{ t: "text", v: `SOLUTION-${number}` }] }],
        topicLabel: "Fractions",
      });
    }
  });
  return out;
}

function documents(format: PaperFormat) {
  const blueprint = buildBlueprint({
    curriculumVersionId: "v1",
    level: "P3",
    subject: "Mathematics",
    topics: [{ topicId: "t1", label: "Fractions", outcomeIds: ["o1"] }],
    settings: { totalMarks: 40, durationMinutes: 45, difficulty: "balanced" },
    format,
  });
  const input = { assessmentName: "End-of-year exam", mockNumber: 1, blueprint, questions: questionsFor(format) };
  return { paper: buildStudentPaper(input), pack: buildAnswerPack(input) };
}

const BOOKLETS: PaperFormat = {
  durationMinutes: 90,
  sections: [
    { label: "Section A", booklet: "Booklet A", kind: "mcq", questionCount: 6, totalMarks: 12, marksEach: 2 },
    { label: "Section B", booklet: "Booklet A", kind: "short", questionCount: 8, totalMarks: 12 },
    { label: "Section C", booklet: "Booklet B", kind: "short", questionCount: 8, totalMarks: 14 },
    { label: "Section D", booklet: "Booklet B", kind: "word_problem", questionCount: 4, totalMarks: 12, marksEach: 3 },
  ],
};

let three: { student: ExtractedPdf; pack: ExtractedPdf };
let booklets: { student: ExtractedPdf; pack: ExtractedPdf };

beforeAll(async () => {
  mkdirSync(outDir, { recursive: true });
  const render = async (format: PaperFormat, name: string) => {
    const { paper, pack } = documents(format);
    const studentBytes = await renderStudentPaperPdf(paper);
    const packBytes = await renderAnswerPackPdf(pack);
    writeFileSync(path.join(outDir, `${name}-student.pdf`), studentBytes);
    writeFileSync(path.join(outDir, `${name}-answers.pdf`), packBytes);
    return { student: await extractPdfText(studentBytes), pack: await extractPdfText(packBytes) };
  };
  three = await render(END_OF_YEAR_COMMON_FORMAT, "format-three-sections");
  booklets = await render(BOOKLETS, "format-booklets");
}, 120_000);

describe("three-section paper (the common end-of-year format)", () => {
  it("headings carry the section name and its marks", () => {
    expect(three.student.text).toContain("Section A (12 marks)");
    expect(three.student.text).toContain("Section B (26 marks)");
    expect(three.student.text).toContain("Section C (12 marks)");
    expect(three.student.text).toContain("Total: 50 marks");
    expect(three.student.text).toContain("Duration: 90 minutes");
  });

  it("each part has the instructions for its kind", () => {
    expect(three.student.text).toContain(
      "For each question, four options are given. One of them is the correct answer. Write its number (1, 2, 3 or 4) in the brackets provided.",
    );
    expect(three.student.text).toContain("Write your answers in the spaces provided. Give your answers in the units stated.");
    expect(three.student.text).toContain(
      "Show your working clearly in the space below each question. Write your answers in the spaces provided.",
    );
  });

  it("numbers questions 1 to 26 across the parts, in order", () => {
    const text = three.student.text;
    let from = 0;
    for (let n = 1; n <= 26; n += 1) {
      const re = new RegExp(`(?<![\\d.])${n}\\.(?!\\d)`, "g");
      re.lastIndex = from;
      const m = re.exec(text);
      expect(m, `question ${n}`).not.toBeNull();
      from = (m as RegExpExecArray).index + 1;
    }
    expect(text.indexOf("Section A (12 marks)")).toBeLessThan(text.indexOf("Section B (26 marks)"));
    expect(text.indexOf("Section B (26 marks)")).toBeLessThan(text.indexOf("Section C (12 marks)"));
  });

  it("has no answers and no booklet headers, and every page says Page n of N", () => {
    expect(three.student.text).not.toMatch(/SOLUTION-|Booklet/);
    three.student.pages.forEach((page, i) => expect(page).toContain(`Page ${i + 1} of ${three.student.pages.length}`));
  });

  it("the answer pack groups answers under the same headings", () => {
    const text = three.pack.text;
    expect(text).toContain("Section A (12 marks)");
    expect(text).toContain("Section B (26 marks)");
    expect(text).toContain("Section C (12 marks)");
    expect(text.indexOf("Section A (12 marks)")).toBeLessThan(text.indexOf("SOLUTION-1 "));
    expect(text.indexOf("SOLUTION-6 ")).toBeLessThan(text.indexOf("Section B (26 marks)"));
    expect(text.indexOf("SOLUTION-22 ")).toBeLessThan(text.indexOf("Section C (12 marks)"));
    expect(text.indexOf("Section C (12 marks)")).toBeLessThan(text.indexOf("SOLUTION-23 "));
  });
});

describe("booklets", () => {
  it("each booklet starts on a new page with its own header", () => {
    const pages = booklets.student.pages;
    const first = pages.findIndex((p) => p.includes("Booklet A"));
    const second = pages.findIndex((p) => p.includes("Booklet B"));
    expect(first).toBe(0);
    expect(second).toBeGreaterThan(first);
    // Booklet B begins at the top of its own page: nothing of booklet A's questions is on that page before it.
    const page = pages[second] as string;
    expect(page.indexOf("Booklet B")).toBeLessThan(page.indexOf("Section C (14 marks)"));
    expect(page).not.toContain("Section B (12 marks)");
    const before = pages.slice(0, second).join(" ");
    expect(before).toContain("Section B (12 marks)");
    expect(before).not.toContain("Section C");
  });

  it("repeats the paper title, the name lines and that booklet's marks in every booklet header", () => {
    const pages = booklets.student.pages;
    const a = pages[0] as string;
    const b = pages.find((p) => p.includes("Booklet B")) as string;
    for (const page of [a, b]) {
      expect(page).toContain("Mathematics End-of-year exam · Mock 1");
      expect(page).toContain("Name");
      expect(page).toContain("Class");
      expect(page).toContain("Date");
    }
    expect(a).toContain("Total: 24 marks");
    expect(b).toContain("Total: 26 marks");
    expect(booklets.student.text).toContain("Duration: 90 minutes");
  });

  it("keeps page numbers continuous across booklets", () => {
    const pages = booklets.student.pages;
    pages.forEach((page, i) => expect(page).toContain(`Page ${i + 1} of ${pages.length}`));
  });

  it("the section headings still show marks under each booklet", () => {
    for (const heading of ["Section A (12 marks)", "Section B (12 marks)", "Section C (14 marks)", "Section D (12 marks)"]) {
      expect(booklets.student.text).toContain(heading);
    }
  });

  it("the answer pack groups answers under the same booklet and section headings", () => {
    const text = booklets.pack.text;
    expect(text.indexOf("Booklet A")).toBeLessThan(text.indexOf("Section A (12 marks)"));
    expect(text.indexOf("Section B (12 marks)")).toBeLessThan(text.indexOf("Booklet B"));
    expect(text.indexOf("Booklet B")).toBeLessThan(text.indexOf("Section C (14 marks)"));
    expect(text.indexOf("Section D (12 marks)")).toBeGreaterThan(text.indexOf("Section C (14 marks)"));
    expect(text).toContain("SOLUTION-26");
  });
});
