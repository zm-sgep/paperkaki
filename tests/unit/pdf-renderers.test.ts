import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { renderAnswerPackPdf, renderStudentPaperPdf, AnswerLeakError, type StudentPaper } from "@/services/pdf";
import {
  SAMPLE_QUESTION_COUNT,
  SAMPLE_TOTAL_MARKS,
  sampleAnswerPack,
  sampleStudentPaper,
} from "../fixtures/pdf/sample-paper";
import { extractPdfText, type ExtractedPdf } from "../helpers/pdf-text";

const outDir = path.resolve(import.meta.dirname, "../output");

let studentBuf: Buffer;
let packBuf: Buffer;
let student: ExtractedPdf;
let pack: ExtractedPdf;

beforeAll(async () => {
  studentBuf = await renderStudentPaperPdf(sampleStudentPaper);
  packBuf = await renderAnswerPackPdf(sampleAnswerPack);
  student = await extractPdfText(studentBuf);
  pack = await extractPdfText(packBuf);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "sample-student-paper.pdf"), studentBuf);
  writeFileSync(path.join(outDir, "sample-answer-pack.pdf"), packBuf);
}, 60_000);

/** Assert 1..count appear as "N." in order. */
function expectNumbersInOrder(text: string, count: number): void {
  let from = 0;
  for (let n = 1; n <= count; n += 1) {
    const re = new RegExp(`(?<![\\d.])${n}\\.(?!\\d)`, "g");
    re.lastIndex = from;
    const m = re.exec(text);
    expect(m, `question number ${n} should appear after position ${from}`).not.toBeNull();
    from = (m as RegExpExecArray).index + 1;
  }
}

describe("fixture sanity", () => {
  it("has about a dozen questions summing to the stated total", () => {
    expect(SAMPLE_QUESTION_COUNT).toBe(12);
    expect(SAMPLE_TOTAL_MARKS).toBe(sampleStudentPaper.totalMarks);
  });
});

describe("student paper PDF", () => {
  it("is a PDF of a sensible length", () => {
    expect(studentBuf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(student.pages.length).toBeGreaterThanOrEqual(3);
    expect(student.pages.length).toBeLessThanOrEqual(8);
  });

  it("page 1 has the header", () => {
    const p1 = student.pages[0] as string;
    expect(p1).toContain("PaperKaki");
    expect(p1).toContain("Mathematics WA2 · Mock 1");
    expect(p1).toContain("Primary 3 · Mathematics");
    expect(p1).toContain("Duration: 45 minutes");
    expect(p1).toContain("Total: 40 marks");
    expect(p1).toContain("Name");
    expect(p1).toContain("Class");
    expect(p1).toContain("Date");
    expect(p1).toContain("Instructions");
    expect(p1).toContain("Calculators are not allowed.");
    expect(p1).toContain("Section A (10 marks)");
  });

  it("every page carries Page n of N", () => {
    const total = student.pages.length;
    student.pages.forEach((page, i) => expect(page).toContain(`Page ${i + 1} of ${total}`));
  });

  it("shows every question number in order, with marks and option numbers", () => {
    expectNumbersInOrder(student.text, SAMPLE_QUESTION_COUNT);
    expect(student.text).toContain("(2 marks)");
    expect(student.text).toContain("(6 marks)");
    for (const label of ["(1)", "(2)", "(3)", "(4)"]) expect(student.text).toContain(label);
    expect(student.text).toContain("Ans:");
    expect(student.text).toContain("Fruit");
    expect(student.text).toContain("245");
    expect(student.text).toContain("[Image: A rectangle 8 cm long and 5 cm wide]");
  });

  it("does not repeat the answer-pack banner and contains no answer-pack markers", () => {
    expect(student.text).not.toContain("not for the child");
    expect(student.text).not.toMatch(/ANSWER-TOKEN|SOLUTION-TOKEN|Worked solution|Topic:/);
  });

  it("never splits a question across pages", () => {
    // Every question's stem start and its marks label sit on the same page.
    const stems = sampleStudentPaper.sections.flatMap((s) => s.questions);
    for (const q of stems) {
      const first = q.content.stem[0];
      if (first?.t !== "p" || first.c[0]?.t !== "text") continue;
      const lead = first.c[0].v.slice(0, 20);
      const pageWithLead = student.pages.filter((pg) => pg.includes(lead));
      expect(pageWithLead.length, `question ${q.number} lead`).toBe(1);
    }
  });
});

describe("answer pack PDF", () => {
  it("has the banner on every page and page numbers", () => {
    const total = pack.pages.length;
    expect(total).toBeGreaterThanOrEqual(2);
    pack.pages.forEach((page, i) => {
      expect(page).toContain("Answer pack · not for the child");
      expect(page).toContain(`Page ${i + 1} of ${total}`);
    });
  });

  it("numbers match the student paper and include marks, answers, solutions and topics", () => {
    expectNumbersInOrder(pack.text, SAMPLE_QUESTION_COUNT);
    for (let n = 1; n <= SAMPLE_QUESTION_COUNT; n += 1) {
      expect(pack.text).toContain(`ANSWER-TOKEN-${n}`);
      expect(pack.text).toContain(`SOLUTION-TOKEN-${n}`);
    }
    expect(pack.text).toContain("Topic: Fractions");
    expect(pack.text).toContain("(3 marks)");
    expect(pack.text).toContain("Worked solution");
  });
});

describe("no answer leakage", () => {
  it("each answer/solution token is in the pack and never in the student paper", () => {
    for (let n = 1; n <= SAMPLE_QUESTION_COUNT; n += 1) {
      for (const token of [`ANSWER-TOKEN-${n}`, `SOLUTION-TOKEN-${n}`]) {
        expect(pack.text).toContain(token);
        expect(student.text).not.toContain(token);
      }
    }
    expect(student.text).not.toContain("first we work out the parts");
  });

  it("rejects answer data at runtime if the types are bypassed", async () => {
    const leaky = structuredClone(sampleStudentPaper) as unknown as Record<string, unknown>;
    ((leaky.sections as Record<string, unknown>[])[0]?.questions as Record<string, unknown>[])[0]!.answer = { kind: "mcq", correct: "B" };
    await expect(renderStudentPaperPdf(leaky as unknown as StudentPaper)).rejects.toBeInstanceOf(AnswerLeakError);
  });

  it("passing an answer is a type error", () => {
    const question = sampleStudentPaper.sections[0]!.questions[0]!;
    // @ts-expect-error answer is not part of a student question
    const withAnswer: typeof question = { ...question, answer: { kind: "mcq", correct: "B" } };
    // @ts-expect-error a worked solution is not part of a student question
    const withSolution: typeof question = { ...question, workedSolution: [] };
    const viaVariable = { ...question, answer: { kind: "mcq", correct: "B" } };
    // @ts-expect-error extra answer property is rejected even through a variable
    const rejected: typeof question = viaVariable;
    expect([withAnswer, withSolution, rejected]).toHaveLength(3);
  });
});

describe("determinism", () => {
  it("rendering twice gives identical extracted text and identical bytes", async () => {
    const again = await renderStudentPaperPdf(sampleStudentPaper);
    expect((await extractPdfText(again)).text).toBe(student.text);
    expect(again.equals(studentBuf)).toBe(true);
    const packAgain = await renderAnswerPackPdf(sampleAnswerPack);
    expect((await extractPdfText(packAgain)).text).toBe(pack.text);
  });
});

describe("edge cases", () => {
  it("handles a resolved image, a missing image and a paper without instructions", async () => {
    // 1x1 transparent PNG
    const png = Uint8Array.from(
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
    );
    const paper: StudentPaper = {
      ...sampleStudentPaper,
      instructions: [],
      sections: [sampleStudentPaper.sections[2]!],
    };
    const withImage = await renderStudentPaperPdf(paper, { images: { "fixture-shape": { data: png, format: "png" } } });
    const text = (await extractPdfText(withImage)).text;
    expect(text).not.toContain("[Image:");
    const missing = await renderStudentPaperPdf(paper, { images: { "fixture-shape": null } });
    expect((await extractPdfText(missing)).text).toContain("[Image:");
  });

  it("maps glyphs Helvetica lacks (minus sign, script l) to printable forms", async () => {
    const paper: StudentPaper = {
      ...sampleStudentPaper,
      sections: [
        {
          title: "Section A",
          questions: [
            {
              number: 1,
              marks: 1,
              workingSpace: "none",
              content: { stem: [{ t: "p", c: [{ t: "text", v: "5 − 2 = 3 and 2 ℓ of water" }] }] },
            },
          ],
        },
      ],
    };
    const text = (await extractPdfText(await renderStudentPaperPdf(paper))).text;
    expect(text).toContain("5 – 2 = 3 and 2 l of water");
  });
});
