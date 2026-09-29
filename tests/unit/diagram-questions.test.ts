import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyQuestionAnswer } from "@/domain/questions";
import { QuestionDraftSchema, type Block, type QuestionDraft } from "@/schemas/question-content";
import {
  renderAnswerPackPdf,
  renderStudentPaperPdf,
  type AnswerPack,
  type StudentPaper,
  type WorkingSpace,
} from "@/services/pdf";
import { extractPdfText } from "../helpers/pdf-text";

const contentDir = path.resolve(import.meta.dirname, "../../content/questions");
const outDir = path.resolve(import.meta.dirname, "../output");
const raw = JSON.parse(readFileSync(path.join(contentDir, "p3-maths-diagrams.json"), "utf8")) as unknown[];

const questions: QuestionDraft[] = raw.map((item, i) => {
  const parsed = QuestionDraftSchema.safeParse(item);
  if (!parsed.success) throw new Error(`#${i}: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
  return parsed.data;
});

type Kind<T extends Block["t"]> = Extract<Block, { t: T }>;
const blocksOf = <T extends Block["t"]>(q: QuestionDraft, t: T): Kind<T>[] =>
  q.content.stem.filter((b): b is Kind<T> => b.t === t);
const lastParagraph = (q: QuestionDraft): string => {
  const p = [...q.content.stem].reverse().find((b) => b.t === "p");
  return p && p.t === "p" ? p.c.map((c) => (c.t === "text" ? c.v : "")).join("") : "";
};
const optionText = (q: QuestionDraft, id: string): string => {
  const c = q.content.options?.find((o) => o.id === id)?.c[0];
  return c && c.t === "text" ? c.v : "";
};

describe("diagram question bank", () => {
  it("every item passes the schema and answer verification", () => {
    const failures: string[] = [];
    for (const q of questions) {
      const r = verifyQuestionAnswer(q);
      if (!r.ok) failures.push(`${q.familyCode}: ${r.reasons.join("; ")}`);
    }
    expect(failures).toEqual([]);
  });

  it("has at least 5 questions for each targeted outcome and about a third are MCQ", () => {
    const outcomes = [
      "P3-MG-AN-01", "P3-MG-AN-02", "P3-MG-AN-03",
      "P3-MG-PL-01", "P3-MG-PL-03",
      "P3-ST-BG-01", "P3-ST-BG-03",
      "P3-MG-AR-01",
    ];
    for (const code of outcomes) {
      const mine = questions.filter((q) => q.primaryOutcomeCode === code);
      expect(mine.length, code).toBeGreaterThanOrEqual(5);
      const mcqShare = mine.filter((q) => q.questionType === "mcq").length / mine.length;
      expect(mcqShare, `${code} MCQ share`).toBeGreaterThanOrEqual(0.2);
      expect(mcqShare, `${code} MCQ share`).toBeLessThanOrEqual(0.5);
    }
    const allowed = new Set([...outcomes, "P3-MG-AR-02"]);
    for (const q of questions) expect(allowed.has(q.primaryOutcomeCode), q.familyCode).toBe(true);
  });

  it("family codes are unique and do not clash with other question files", () => {
    const codes = questions.map((q) => q.familyCode);
    expect(new Set(codes).size).toBe(codes.length);
    const others = readdirSync(contentDir)
      .filter((f) => f.endsWith(".json") && f !== "p3-maths-diagrams.json")
      .flatMap((f) => (JSON.parse(readFileSync(path.join(contentDir, f), "utf8")) as { familyCode: string }[]).map((q) => q.familyCode));
    for (const code of codes) expect(others, code).not.toContain(code);
    for (const q of questions) expect(q.familyCode.startsWith(q.primaryOutcomeCode.split("-").slice(0, 3).join("-") + "-F")).toBe(true);
  });

  it("includes every diagram type, bar graph scales 2, 5 and 10, and both orientations", () => {
    const stems = questions.flatMap((q) => q.content.stem);
    for (const t of ["bargraph", "grid", "angle", "lines"] as const) expect(stems.some((b) => b.t === t), t).toBe(true);
    const graphs = stems.filter((b): b is Kind<"bargraph"> => b.t === "bargraph");
    expect(new Set(graphs.map((g) => g.scale.step))).toEqual(new Set([1, 2, 5, 10]));
    expect(new Set(graphs.map((g) => g.orientation))).toEqual(new Set(["vertical", "horizontal"]));
    expect(stems.some((b) => b.t === "lines" && b.dotGrid !== undefined)).toBe(true);
  });

  it("drawing questions are text answers checked by a human, with a marking criterion", () => {
    const drawing = questions.filter((q) => /^Draw |\. Draw |Draw the other/.test(lastParagraph(q)));
    expect(drawing.length).toBeGreaterThanOrEqual(5);
    for (const q of drawing) {
      expect(q.questionType, q.familyCode).toBe("text");
      expect("human" in q.verification, q.familyCode).toBe(true);
      expect(blocksOf(q, "lines").some((l) => l.dotGrid !== undefined), q.familyCode).toBe(true);
      if (q.marks > 1) expect(q.markingScheme.partialMarks?.length, q.familyCode).toBe(q.marks);
    }
  });

  it("bar graph numeric answers are computed from the bar values", () => {
    const bg = questions.filter((q) => q.primaryOutcomeCode.startsWith("P3-ST-BG") && "expression" in q.verification);
    expect(bg.length).toBeGreaterThanOrEqual(8);
    for (const q of bg) {
      const graphs = blocksOf(q, "bargraph");
      expect(graphs.length, q.familyCode).toBeGreaterThan(0);
      const known = new Set<number>();
      for (const g of graphs) {
        g.bars.forEach((b) => known.add(b.value));
        known.add(g.scale.step);
        known.add(g.scale.max / g.scale.step);
      }
      const expr = (q.verification as { expression: string }).expression;
      const literals = (expr.match(/\d+/g) ?? []).map(Number);
      expect(literals.some((n) => known.has(n)), `${q.familyCode}: ${expr}`).toBe(true);
    }
  });

  it("area and perimeter answers match the grid data", () => {
    for (const q of questions.filter((x) => x.primaryOutcomeCode === "P3-MG-AR-02")) {
      const outline = blocksOf(q, "grid").find((g) => g.outline)?.outline;
      expect(outline, q.familyCode).toBeDefined();
      const pts = outline as [number, number][];
      const perimeter = pts.reduce((sum, [x, y], i) => {
        const [nx, ny] = pts[(i + 1) % pts.length] as [number, number];
        return sum + Math.abs(nx - x) + Math.abs(ny - y);
      }, 0);
      const value = q.answer.kind === "number" ? Number(q.answer.value) : Number(optionText(q, (q.answer as { correct: string }).correct));
      expect(value, q.familyCode).toBe(perimeter);
    }
    for (const q of questions.filter((x) => x.familyTitle.startsWith("Area"))) {
      const shaded = blocksOf(q, "grid")[0]?.shaded?.length;
      const value = q.answer.kind === "number" ? Number(q.answer.value) : Number(optionText(q, (q.answer as { correct: string }).correct));
      expect(value, q.familyCode).toBe(shaded);
    }
  });

  it("perpendicular and parallel answers match the coordinates", () => {
    type Seg = { from: [number, number]; to: [number, number]; label?: string };
    const vec = (s: Seg) => [s.to[0] - s.from[0], s.to[1] - s.from[1]] as const;
    const parallel = (a: Seg, b: Seg) => vec(a)[0] * vec(b)[1] - vec(a)[1] * vec(b)[0] === 0;
    const perpendicular = (a: Seg, b: Seg) => vec(a)[0] * vec(b)[0] + vec(a)[1] * vec(b)[1] === 0;
    const through = (s: Seg, [px, py]: [number, number]) =>
      (s.to[0] - s.from[0]) * (py - s.from[1]) - (s.to[1] - s.from[1]) * (px - s.from[0]) === 0;
    let checked = 0;
    for (const q of questions.filter((x) => x.questionType === "mcq")) {
      const m = /is (parallel|perpendicular) to line (\w+)\?$/.exec(lastParagraph(q));
      const fig = blocksOf(q, "lines")[0];
      if (!m || !fig) continue;
      const ref = fig.segments.find((s) => s.label === m[2]) as Seg;
      const through1 = fig.points?.[0]?.at;
      const matches = ["A", "B", "C", "D"].filter((id) => {
        const seg = fig.segments.find((s) => s.label === optionText(q, id).replace("Line ", "")) as Seg;
        if (through1 && !through(seg, through1)) throw new Error(`${q.familyCode}: option ${id} does not pass through the point`);
        return m[1] === "parallel" ? parallel(ref, seg) : perpendicular(ref, seg);
      });
      expect(matches, q.familyCode).toEqual([(q.answer as { correct: string }).correct]);
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("angle answers match the drawn degrees", () => {
    const degreesOf = (q: QuestionDraft): Map<string, number> =>
      new Map(blocksOf(q, "angle").map((a) => [a.label ?? "", a.degrees]));
    let checked = 0;
    for (const q of questions.filter((x) => x.primaryOutcomeCode.startsWith("P3-MG-AN"))) {
      const angles = degreesOf(q);
      const ask = lastParagraph(q);
      const test: Record<string, (d: number) => boolean> = {
        "Which angle is a right angle?": (d) => d === 90,
        "Which angle is greater than a right angle?": (d) => d > 90,
        "Which angle is smaller than a right angle?": (d) => d < 90,
        "How many of these angles are right angles?": (d) => d === 90,
        "How many of these angles are smaller than a right angle?": (d) => d < 90,
      };
      const fn = test[ask];
      if (!fn) continue;
      const matching = [...angles].filter(([, d]) => fn(d)).map(([l]) => l);
      if (q.answer.kind === "mcq") {
        expect(matching, q.familyCode).toEqual([optionText(q, q.answer.correct).replace("Angle ", "")]);
      } else if (q.answer.kind === "number") {
        expect(matching.length, q.familyCode).toBe(Number(q.answer.value));
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(5);
    // Order questions: the answer letters sort by degrees.
    for (const q of questions.filter((x) => lastParagraph(x).startsWith("Write P, Q and R in order"))) {
      const angles = degreesOf(q);
      const order = [...angles].sort((a, b) => a[1] - b[1]).map(([l]) => l).join(", ");
      expect(q.answer.kind === "text" && q.answer.accepted[0], q.familyCode).toBe(order);
    }
    // Angles must be clearly distinguishable from a right angle in a comparison question.
    for (const q of questions.filter((x) => x.primaryOutcomeCode === "P3-MG-AN-02" || x.primaryOutcomeCode === "P3-MG-AN-01")) {
      for (const a of blocksOf(q, "angle")) expect(Math.abs(a.degrees - 90) >= 20 || a.degrees === 90, `${q.familyCode} ${a.degrees}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The whole bank as a printed paper and answer pack
// ---------------------------------------------------------------------------

function workingSpace(marks: number): WorkingSpace {
  return marks >= 3 ? "medium" : marks === 2 ? "small" : "none";
}

function answerInlines(q: QuestionDraft): { t: "text"; v: string }[] {
  const a = q.answer;
  if (a.kind === "mcq") return [{ t: "text", v: `(${"ABCD".indexOf(a.correct) + 1}) ${optionText(q, a.correct)}`.trim() }];
  if (a.kind === "number") return [{ t: "text", v: `${a.value}${a.unit ? ` ${a.unit}` : ""}` }];
  if (a.kind === "text") return [{ t: "text", v: a.accepted[0] as string }];
  return [{ t: "text", v: a.value }];
}

describe("diagram questions as a printed paper", () => {
  let paper: StudentPaper;
  let pack: AnswerPack;
  let studentBuf: Buffer;
  let student: { pages: string[]; text: string };
  let packText: string;

  beforeAll(async () => {
    const topics = ["P3-MG-AN", "P3-MG-PL", "P3-ST-BG", "P3-MG-AR"];
    let n = 0;
    const sections = topics.map((topic) => {
      const items = questions.filter((q) => q.primaryOutcomeCode.startsWith(topic));
      return {
        title: `${topic} (${items.reduce((s, q) => s + q.marks, 0)} marks)`,
        items: items.map((q) => {
          n += 1;
          return { number: n, q };
        }),
      };
    });
    paper = {
      title: "Diagram questions · check",
      levelLabel: "Primary 3",
      subjectLabel: "Mathematics",
      durationMinutes: 60,
      totalMarks: questions.reduce((s, q) => s + q.marks, 0),
      instructions: ["Answer all questions."],
      sections: sections.map((s) => ({
        title: s.title,
        questions: s.items.map(({ number, q }) => ({ number, marks: q.marks, workingSpace: workingSpace(q.marks), content: q.content })),
      })),
    };
    pack = {
      title: paper.title,
      sections: sections.map((s) => ({
        title: s.title,
        questions: s.items.map(({ number, q }) => ({
          number,
          marks: q.marks,
          answer: answerInlines(q),
          workedSolution: q.workedSolution,
          topicLabel: q.familyTitle,
        })),
      })),
    };
    studentBuf = await renderStudentPaperPdf(paper);
    const packBuf = await renderAnswerPackPdf(pack);
    student = await extractPdfText(studentBuf);
    packText = (await extractPdfText(packBuf)).text;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "diagram-questions.pdf"), studentBuf);
    writeFileSync(path.join(outDir, "diagram-questions-answer-pack.pdf"), packBuf);
  }, 120_000);

  it("renders every question in both documents", () => {
    expect(student.pages.length).toBeGreaterThan(5);
    for (let n = 1; n <= questions.length; n += 1) {
      expect(new RegExp(`(?<![\\d.])${n}\\.(?!\\d)`).test(student.text), `question ${n}`).toBe(true);
    }
    expect(packText).toContain("Worked solution");
  });

  it("shows bar labels, axis labels and point labels from the questions", () => {
    for (const q of questions) {
      for (const g of blocksOf(q, "bargraph")) {
        for (const text of [g.title, g.valueAxisLabel, g.categoryAxisLabel, ...g.bars.map((b) => b.label)]) {
          expect(student.text.includes(text), `${q.familyCode}: ${text}`).toBe(true);
        }
      }
      for (const l of blocksOf(q, "lines")) {
        for (const label of [...l.segments.map((s) => s.label), ...(l.points ?? []).map((p) => p.label)]) {
          if (label) expect(student.text.includes(label), `${q.familyCode}: ${label}`).toBe(true);
        }
      }
    }
  });

  it("rendering twice gives identical output", async () => {
    const again = await renderStudentPaperPdf(paper);
    expect(again.equals(studentBuf)).toBe(true);
    expect((await extractPdfText(again)).text).toBe(student.text);
  });

  it("does not put worked solutions or the answer banner into the student paper", () => {
    expect(student.text).not.toContain("Worked solution");
    expect(student.text).not.toContain("not for the child");
  });
});
