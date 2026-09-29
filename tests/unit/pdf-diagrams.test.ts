import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { renderAnswerPackPdf, renderStudentPaperPdf } from "@/services/pdf";
import { layoutAngle, layoutBarGraph, layoutGrid, layoutLines, wrapLabel } from "@/services/pdf/diagram-layout";
import { BarGraphBlockSchema } from "@/schemas/question-content";
import {
  ANGLES,
  DIAGRAM_LABELS,
  DIAGRAM_QUESTION_COUNT,
  FRUIT_GRAPH,
  LINES_FIGURE,
  PETS_GRAPH,
  diagramAnswerPack,
  diagramStudentPaper,
} from "../fixtures/pdf/diagram-paper";
import { extractPdfText, type ExtractedPdf } from "../helpers/pdf-text";

const outDir = path.resolve(import.meta.dirname, "../output");

let studentBuf: Buffer;
let packBuf: Buffer;
let student: ExtractedPdf;
let pack: ExtractedPdf;

beforeAll(async () => {
  studentBuf = await renderStudentPaperPdf(diagramStudentPaper);
  packBuf = await renderAnswerPackPdf(diagramAnswerPack);
  student = await extractPdfText(studentBuf);
  pack = await extractPdfText(packBuf);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "diagrams-sample.pdf"), studentBuf);
  writeFileSync(path.join(outDir, "diagrams-answer-pack.pdf"), packBuf);
}, 60_000);

/** Whole-word presence in extracted text (labels are separate text items). */
const hasWord = (text: string, word: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`).test(text);

describe("diagram fixture paper", () => {
  it("renders as a PDF in both renderers", () => {
    expect(studentBuf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(packBuf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(DIAGRAM_QUESTION_COUNT).toBe(7);
  });

  it("student paper shows every bar, axis, title, line and point label", () => {
    for (const label of DIAGRAM_LABELS) expect(hasWord(student.text, label), `student paper: ${label}`).toBe(true);
    for (const tick of ["0", "10", "50", "20"]) expect(hasWord(student.text, tick), `tick ${tick}`).toBe(true);
    for (const angle of ["P", "Q", "R", "S"]) expect(hasWord(student.text, angle), `angle ${angle}`).toBe(true);
  });

  it("answer pack draws the same diagrams in the worked solutions", () => {
    for (const label of DIAGRAM_LABELS) expect(hasWord(pack.text, label), `answer pack: ${label}`).toBe(true);
    for (const angle of ["P", "Q", "R", "S"]) expect(hasWord(pack.text, angle), `angle ${angle}`).toBe(true);
  });

  it("never splits a diagram from its question or across pages", () => {
    // Each diagram's title/label and the sentence that follows it share one page.
    const pairs: [string, string][] = [
      ["Fruit sold at a stall", "How many more oranges"],
      ["Pets owned by Primary 3 pupils", "hamster or a rabbit"],
      ["Which angle is greater", "Ans:"],
      ["Which line is perpendicular", "Ans:"],
    ];
    for (const [a, b] of pairs) {
      const pages = student.pages.filter((pg) => pg.includes(a));
      expect(pages.length, a).toBe(1);
      expect(pages[0]).toContain(b);
    }
    // Every bar graph, grid, angle and lines label on a page is followed by that page's question.
    const graphPage = student.pages.findIndex((pg) => pg.includes("Number of fruit sold"));
    expect(student.pages[graphPage]).toContain("Fruit");
    expect(student.pages[graphPage]).toContain("Apples");
    expect(student.pages[graphPage]).toContain("Bananas");
  });

  it("rendering twice gives identical extracted text and identical bytes", async () => {
    const again = await renderStudentPaperPdf(diagramStudentPaper);
    expect((await extractPdfText(again)).text).toBe(student.text);
    expect(again.equals(studentBuf)).toBe(true);
    const packAgain = await renderAnswerPackPdf(diagramAnswerPack);
    expect((await extractPdfText(packAgain)).text).toBe(pack.text);
    expect(packAgain.equals(packBuf)).toBe(true);
  });

  it("does not leak answer tokens into the student paper", () => {
    expect(student.text).not.toContain("ANSWER-DIAGRAM");
    expect(pack.text).toContain("ANSWER-DIAGRAM-7");
  });
});

describe("diagram layout", () => {
  it("bar heights are proportional to values on the scale", () => {
    const layout = layoutBarGraph(FRUIT_GRAPH as Parameters<typeof layoutBarGraph>[0]);
    const [apples, pears, oranges] = layout.bars;
    expect(oranges!.h).toBeCloseTo(apples!.h * (50 / 30), 1);
    expect(pears!.h).toBeCloseTo(oranges!.h * (20 / 50), 1);
    // One gridline per step above zero (10, 20, 30, 40, 50).
    expect(layout.gridlines).toHaveLength(5);
    // The tallest bar reaches the top gridline.
    expect(oranges!.y).toBeCloseTo(layout.gridlines.at(-1)!.y1, 1);
  });

  it("horizontal bars grow rightwards from the axis and stay on the plot", () => {
    const layout = layoutBarGraph(PETS_GRAPH as Parameters<typeof layoutBarGraph>[0]);
    expect(layout.bars).toHaveLength(5);
    const widest = Math.max(...layout.bars.map((b) => b.w));
    const axisRight = Math.max(...layout.axes.map((a) => Math.max(a.x1, a.x2)));
    expect(layout.bars[0]!.x + widest).toBeLessThanOrEqual(axisRight);
    expect(layout.width).toBeLessThan(400);
  });

  it("a 90 degree angle is exactly upright and the right-angle mark is only drawn when asked", () => {
    const plain = layoutAngle({ t: "angle", degrees: 90, armLengthMm: 20 });
    expect(plain.arm2.x2).toBe(plain.arm2.x1);
    expect(plain.rightMark).toBeNull();
    const marked = layoutAngle({ t: "angle", degrees: 90, armLengthMm: 20, showRightAngleMark: true });
    expect(marked.rightMark).not.toBeNull();
    const obtuse = layoutAngle({ t: "angle", degrees: 135, armLengthMm: 20 });
    expect(obtuse.arm2.x2).toBeLessThan(obtuse.arm2.x1);
    expect(ANGLES).toHaveLength(4);
  });

  it("grid squares are square and an outline stays inside the grid", () => {
    const layout = layoutGrid({ t: "grid", cols: 4, rows: 3, cellMm: 10, outline: [[0, 0], [4, 0], [4, 3], [0, 3]] });
    expect(layout.width).toBeCloseTo(4 * layout.cell + 6, 1);
    expect(layout.height).toBeCloseTo(3 * layout.cell + 6, 1);
    expect(layout.lines).toHaveLength(4 + 1 + 3 + 1);
    expect(layout.outline).not.toBeNull();
  });

  it("lines keep the y axis pointing up", () => {
    const layout = layoutLines(LINES_FIGURE as Parameters<typeof layoutLines>[0]);
    // AB (y = 1) is below CD (y = 3) on the page, so its pixel y is larger.
    expect(layout.segments[0]!.y1).toBeGreaterThan(layout.segments[1]!.y1);
    expect(layout.points).toHaveLength(1);
  });

  it("wraps long category labels onto two lines only at spaces", () => {
    expect(wrapLabel("Guinea pig", 6)).toEqual(["Guinea", "pig"]);
    expect(wrapLabel("Hamster", 3)).toEqual(["Hamster"]);
    expect(wrapLabel("Fish", 10)).toEqual(["Fish"]);
  });

  it("fixture graphs satisfy the schema", () => {
    expect(BarGraphBlockSchema.safeParse(FRUIT_GRAPH).success).toBe(true);
    expect(BarGraphBlockSchema.safeParse(PETS_GRAPH).success).toBe(true);
  });
});
