import type { MockPaper, MockQuestion } from "@/components/mock/types";
import type { Inline } from "@/schemas/question-content";

/**
 * A fictional 8-question paper for the development preview and its tests. Invented for this
 * screen only: it is not curriculum content and never enters the question bank. There are no
 * answers here, because the mock screen never receives them.
 */

const t = (v: string): Inline => ({ t: "text", v });
const frac = (n: number, d: number): Inline => ({ t: "frac", n, d });

const questions: MockQuestion[] = [
  {
    id: "pv-q1",
    marks: 1,
    working: false,
    input: { kind: "mcq" },
    content: {
      stem: [{ t: "p", c: [t("What is the value of the digit 6 in 4 361?")] }],
      options: [
        { id: "A", c: [t("6")] },
        { id: "B", c: [t("60")] },
        { id: "C", c: [t("600")] },
        { id: "D", c: [t("6 000")] },
      ],
    },
  },
  {
    id: "pv-q2",
    marks: 1,
    working: false,
    input: { kind: "number", unit: "cm" },
    content: {
      stem: [{ t: "p", c: [t("A ribbon is 3 m 40 cm long. What is its length in centimetres?")] }],
    },
  },
  {
    id: "pv-q3",
    marks: 2,
    working: true,
    input: { kind: "fraction" },
    content: {
      stem: [
        {
          t: "p",
          c: [t("Mei ate "), frac(1, 4), t(" of a pizza. Sam ate "), frac(2, 4), t(" of the same pizza. What fraction of the pizza did they eat altogether?")],
        },
      ],
    },
  },
  {
    id: "pv-q4",
    marks: 3,
    working: true,
    input: { kind: "number", unit: "$" },
    content: {
      stem: [
        {
          t: "p",
          c: [t("Mrs Tan bought 3 storybooks at $12 each and a pen for $4. How much did she spend altogether?")],
        },
      ],
    },
  },
  {
    id: "pv-q5",
    marks: 2,
    working: true,
    input: { kind: "number" },
    content: {
      stem: [
        { t: "p", c: [t("The bar graph shows the number of books 4 pupils read in June. How many more books did Ben read than Ann?")] },
        {
          t: "bargraph",
          title: "Books read in June",
          categoryAxisLabel: "Pupil",
          valueAxisLabel: "Number of books",
          scale: { max: 10, step: 2 },
          bars: [
            { label: "Ann", value: 4 },
            { label: "Ben", value: 9 },
            { label: "Cara", value: 6 },
            { label: "Dev", value: 7 },
          ],
          orientation: "vertical",
        },
      ],
    },
  },
  {
    id: "pv-q6",
    marks: 1,
    working: false,
    input: { kind: "mcq" },
    content: {
      stem: [{ t: "p", c: [t("Which fraction is the smallest?")] }],
      options: [
        { id: "A", c: [frac(3, 4)] },
        { id: "B", c: [frac(3, 8)] },
        { id: "C", c: [frac(3, 5)] },
        { id: "D", c: [frac(3, 6)] },
      ],
    },
  },
  {
    id: "pv-q7",
    marks: 2,
    working: true,
    input: { kind: "text" },
    content: {
      stem: [{ t: "p", c: [t("Write 5 209 in words.")] }],
    },
  },
  {
    id: "pv-q8",
    marks: 4,
    working: true,
    input: { kind: "number" },
    content: {
      stem: [
        {
          t: "p",
          c: [t("There are 8 rows of chairs in a hall. Each row has 24 chairs. 65 chairs are empty. How many chairs are taken?")],
        },
      ],
    },
  },
];

export function previewPaper(attemptId: string): MockPaper {
  return {
    attemptId,
    title: "Mathematics WA2 · Mock 1",
    durationMinutes: 45,
    questions,
  };
}
