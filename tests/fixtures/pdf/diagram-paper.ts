import type { Block, Inline } from "@/schemas/question-content";
import type { AnswerPack, StudentPaper, WorkingSpace } from "@/services/pdf";

/**
 * A short paper with one or more of every diagram block type, used to check
 * that diagrams render in both the student paper and the answer pack.
 * Every label the test asserts is defined here once.
 */

const text = (v: string): Inline => ({ t: "text", v });
const p = (...c: Inline[]): Block => ({ t: "p", c });

export const FRUIT_GRAPH: Block = {
  t: "bargraph",
  title: "Fruit sold at a stall",
  categoryAxisLabel: "Fruit",
  valueAxisLabel: "Number of fruit sold",
  scale: { max: 50, step: 10 },
  orientation: "vertical",
  bars: [
    { label: "Apples", value: 30 },
    { label: "Pears", value: 20 },
    { label: "Oranges", value: 50 },
    { label: "Bananas", value: 40 },
  ],
};

export const PETS_GRAPH: Block = {
  t: "bargraph",
  title: "Pets owned by Primary 3 pupils",
  categoryAxisLabel: "Pet",
  valueAxisLabel: "Number of pupils",
  scale: { max: 20, step: 2 },
  orientation: "horizontal",
  bars: [
    { label: "Fish", value: 9 },
    { label: "Hamster", value: 6 },
    { label: "Rabbit", value: 4 },
    { label: "Guinea pig", value: 12 },
    { label: "Turtle", value: 3 },
  ],
};

export const SHADED_GRID: Block = {
  t: "grid",
  cols: 8,
  rows: 5,
  cellMm: 8,
  shaded: [
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 2],
    [2, 2],
    [3, 2],
    [3, 3],
    [4, 3],
  ],
};

export const OUTLINE_GRID: Block = {
  t: "grid",
  cols: 7,
  rows: 6,
  cellMm: 8,
  outline: [
    [1, 1],
    [5, 1],
    [5, 3],
    [3, 3],
    [3, 5],
    [1, 5],
  ],
};

export const ANGLES: Block[] = [
  { t: "angle", degrees: 40, armLengthMm: 20, label: "P" },
  { t: "angle", degrees: 90, armLengthMm: 20, label: "Q" },
  { t: "angle", degrees: 135, armLengthMm: 20, label: "R" },
  { t: "angle", degrees: 90, armLengthMm: 20, label: "S", showRightAngleMark: true },
];

export const LINES_FIGURE: Block = {
  t: "lines",
  segments: [
    { from: [1, 1], to: [8, 1], label: "AB" },
    { from: [1, 3], to: [8, 3], label: "CD" },
    { from: [4, 0], to: [4, 5], label: "EF" },
    { from: [6, 5], to: [9, 2], label: "GH" },
  ],
  points: [{ at: [2, 4], label: "X" }],
};

export const DRAW_GRID: Block = {
  t: "lines",
  segments: [{ from: [1, 1], to: [7, 1], label: "PQ" }],
  points: [{ at: [4, 4], label: "M" }],
  dotGrid: { cols: 9, rows: 6 },
};

/** Labels the tests expect to find in the extracted text. */
export const DIAGRAM_LABELS = [
  "Fruit sold at a stall",
  "Number of fruit sold",
  "Apples",
  "Oranges",
  "Bananas",
  "Pets owned by Primary 3 pupils",
  "Number of pupils",
  "Guinea pig",
  "Hamster",
  "AB",
  "CD",
  "EF",
  "GH",
  "X",
  "PQ",
  "M",
] as const;

interface Item {
  marks: number;
  workingSpace: WorkingSpace;
  stem: Block[];
  solution: Block[];
}

const items: Item[] = [
  { marks: 2, workingSpace: "small", stem: [FRUIT_GRAPH, p(text("How many more oranges than pears were sold?"))], solution: [p(text("50 – 20 = 30")), FRUIT_GRAPH] },
  { marks: 2, workingSpace: "small", stem: [PETS_GRAPH, p(text("How many pupils own a hamster or a rabbit?"))], solution: [PETS_GRAPH, p(text("6 + 4 = 10"))] },
  { marks: 2, workingSpace: "none", stem: [SHADED_GRID, p(text("Each square is 1 square unit. What is the area of the shaded part?"))], solution: [SHADED_GRID, p(text("Count the shaded squares: 8 square units."))] },
  { marks: 2, workingSpace: "small", stem: [OUTLINE_GRID, p(text("Each side of a square is 1 cm. Find the perimeter of the figure."))], solution: [OUTLINE_GRID, p(text("Perimeter = 16 cm"))] },
  { marks: 2, workingSpace: "none", stem: [p(text("Which angle is greater than a right angle?")), ...ANGLES], solution: [p(text("Angle R is greater than a right angle.")), ...ANGLES] },
  { marks: 2, workingSpace: "none", stem: [LINES_FIGURE, p(text("Which line is perpendicular to line AB?"))], solution: [LINES_FIGURE, p(text("Line EF."))] },
  { marks: 2, workingSpace: "none", stem: [DRAW_GRID, p(text("Draw a line through M that is parallel to PQ."))], solution: [DRAW_GRID, p(text("A horizontal line through M."))] },
];

export const DIAGRAM_QUESTION_COUNT = items.length;

export const diagramStudentPaper: StudentPaper = {
  title: "Diagram check · Mock 1",
  levelLabel: "Primary 3",
  subjectLabel: "Mathematics",
  durationMinutes: 30,
  totalMarks: items.reduce((sum, i) => sum + i.marks, 0),
  instructions: ["Answer all questions."],
  sections: [
    {
      title: "Section A",
      questions: items.map((item, i) => ({
        number: i + 1,
        marks: item.marks,
        workingSpace: item.workingSpace,
        content: { stem: item.stem },
      })),
    },
  ],
};

export const diagramAnswerPack: AnswerPack = {
  title: "Diagram check · Mock 1",
  sections: [
    {
      title: "Section A",
      questions: items.map((item, i) => ({
        number: i + 1,
        marks: item.marks,
        answer: [text(`ANSWER-DIAGRAM-${i + 1}`)],
        workedSolution: item.solution,
        topicLabel: "Diagrams",
      })),
    },
  ],
};
