import type { Block, Inline, QuestionContent } from "@/schemas/question-content";
import type { AnswerPack, StudentPaper, WorkingSpace } from "@/services/pdf";

/**
 * A representative Primary 3 Maths mock, built from one source of truth so the
 * student paper and the answer pack always agree on numbering and marks.
 * Answer-side text uses distinctive seeded tokens (ANSWER-TOKEN-n, SOLUTION-TOKEN-n)
 * so tests can prove they never leak into the student paper.
 */

const text = (v: string): Inline => ({ t: "text", v });
const frac = (n: number, d: number, whole?: number): Inline =>
  whole === undefined ? { t: "frac", n, d } : { t: "frac", n, d, whole };
const p = (...c: Inline[]): Block => ({ t: "p", c });
const opts = (...cells: Inline[][]): QuestionContent["options"] =>
  cells.map((c, i) => ({ id: (["A", "B", "C", "D"] as const)[i] as "A", c }));

interface Item {
  marks: number;
  workingSpace: WorkingSpace;
  content: QuestionContent;
  topic: string;
}

const sectionA: Item[] = [
  { marks: 2, workingSpace: "none", topic: "Numbers to 10 000", content: { stem: [p(text("Kai counts on in hundreds: 3400, 3500, 3600, ... What number does he say next?"))], options: opts([text("3610")], [text("3700")], [text("3601")], [text("4600")]) } },
  { marks: 2, workingSpace: "none", topic: "Addition", content: { stem: [p(text("What is 4582 + 1936?"))], options: opts([text("5518")], [text("6408")], [text("6518")], [text("5408")]) } },
  { marks: 2, workingSpace: "none", topic: "Fractions", content: { stem: [p(text("Which fraction is the same as "), frac(2, 4), text("?"))], options: opts([frac(1, 2)], [frac(1, 4)], [frac(2, 3)], [frac(3, 4)]) } },
  { marks: 2, workingSpace: "none", topic: "Multiplication tables", content: { stem: [p(text("A box holds 8 pencils. How many pencils are in 7 boxes?"))], options: opts([text("54")], [text("56")], [text("63")], [text("15")]) } },
  { marks: 2, workingSpace: "none", topic: "Money", content: { stem: [p(text("Mei has $5.60. She buys a pen for $1.35. How much money does she have left?"))], options: opts([text("$3.25")], [text("$4.25")], [text("$4.35")], [text("$6.95")]) } },
];

const sectionB: Item[] = [
  { marks: 3, workingSpace: "small", topic: "Subtraction", content: { stem: [p(text("Fill in the blank: 7003 – 2468 = "), { t: "blank" })] } },
  { marks: 3, workingSpace: "small", topic: "Fractions", content: { stem: [p(text("Ali ate "), frac(3, 8), text(" of a pizza and Beth ate "), frac(2, 8), text(" of it. What fraction of the pizza did they eat altogether?"))] } },
  { marks: 3, workingSpace: "medium", topic: "Picture graphs and tables", content: { stem: [{ t: "table", header: true, rows: [[[text("Fruit")], [text("Apples")], [text("Pears")], [text("Plums")]], [[text("Number sold")], [text("245")], [text("318")], [text("196")]]] }, p(text("How many fruits were sold altogether?"))] } },
  { marks: 3, workingSpace: "small", topic: "Word problems", content: { stem: [p(text("A shop had a sign that read the word for the shape with 3 sides. Write the name of the shape."))] } },
];

const sectionC: Item[] = [
  { marks: 6, workingSpace: "large", topic: "Multiplication and division", content: { stem: [p(text("There are 6 rows of chairs in a hall with 25 chairs in each row. 38 chairs are taken away. How many chairs are left in the hall?"))] } },
  { marks: 6, workingSpace: "large", topic: "Fractions", content: { stem: [p(text("Sam had "), frac(3, 4, 1), text(" litres of juice. He drank "), frac(1, 4), text(" litre. How much juice was left? Give your answer as a mixed number in simplest form."))] } },
  { marks: 6, workingSpace: "medium", topic: "Shapes and symmetry", content: { stem: [{ t: "image", assetKey: "fixture-shape", alt: "A rectangle 8 cm long and 5 cm wide", widthMm: 60 }, p(text("What is the perimeter of the rectangle above?"))] } },
];

const sections: { title: string; instructions?: string; items: Item[] }[] = [
  { title: "Section A (10 marks)", instructions: "Questions 1 to 5 carry 2 marks each. Circle the number of the correct answer.", items: sectionA },
  { title: "Section B (12 marks)", instructions: "Write your answers on the lines provided.", items: sectionB },
  { title: "Section C (18 marks)", instructions: "Show your working clearly in the space given.", items: sectionC },
];

export const SAMPLE_INSTRUCTIONS = [
  "Do not turn over this page until you are told to do so.",
  "Answer all questions.",
  "Write your answers in blue or black ink.",
  "Calculators are not allowed.",
];

let counter = 0;
const numbered = sections.map((s) => ({
  ...s,
  items: s.items.map((item) => ({ ...item, number: ++counter })),
}));

export const SAMPLE_QUESTION_COUNT = counter;

export const sampleStudentPaper: StudentPaper = {
  title: "Mathematics WA2 · Mock 1",
  levelLabel: "Primary 3",
  subjectLabel: "Mathematics",
  durationMinutes: 45,
  totalMarks: 40,
  instructions: SAMPLE_INSTRUCTIONS,
  sections: numbered.map((s) => ({
    title: s.title,
    ...(s.instructions ? { instructions: s.instructions } : {}),
    questions: s.items.map((i) => ({ number: i.number, marks: i.marks, content: i.content, workingSpace: i.workingSpace })),
  })),
};

export const sampleAnswerPack: AnswerPack = {
  title: "Mathematics WA2 · Mock 1",
  sections: numbered.map((s) => ({
    title: s.title,
    questions: s.items.map((i) => ({
      number: i.number,
      marks: i.marks,
      topicLabel: i.topic,
      answer: [text(`ANSWER-TOKEN-${i.number}`)],
      workedSolution: [
        p(text(`SOLUTION-TOKEN-${i.number}: first we work out the parts, then we combine them.`)),
        ...(i.number === 8 ? [p(frac(5, 8), text(" of the pizza was eaten."))] : []),
      ],
    })),
  })),
};

export const SAMPLE_TOTAL_MARKS = sampleStudentPaper.sections.flatMap((s) => s.questions).reduce((a, q) => a + q.marks, 0);
