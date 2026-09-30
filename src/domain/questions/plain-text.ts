import type { Answer, Block, QuestionContent } from "@/schemas/question-content";
import { inlineText } from "./lifecycle";

/**
 * Plain-text renderings of a question, its answer and its worked solution, for a second marker (a
 * person reading a summary, or the AI service). Pure and deterministic. Diagrams and pictures are
 * named, never described: the marker is told when there is one it cannot read from text.
 */

function blockText(block: Block): string {
  switch (block.t) {
    case "p":
      return inlineText(block.c);
    case "table":
      return block.rows.map((row) => row.map((cell) => inlineText(cell)).join(" | ")).join("\n");
    case "image":
      return `[Picture: ${block.alt}]`;
    case "bargraph":
      return `[Bar graph "${block.title}": ${block.bars.map((bar) => `${bar.label} ${bar.value}`).join(", ")}]`;
    case "grid":
      return "[A grid of squares]";
    case "angle":
      return `[An angle of ${block.degrees} degrees]`;
    case "lines":
      return "[A line drawing]";
  }
}

export function blocksText(blocks: readonly Block[]): string {
  return blocks.map(blockText).join("\n");
}

/** The question as printed: the stem, then the options. */
export function questionText(content: QuestionContent): string {
  const options = (content.options ?? []).map((option) => `(${option.id}) ${inlineText(option.c)}`);
  return [blocksText(content.stem), ...options].join("\n");
}

/** The correct answer as a person would write it: "12 cm", "$3.50", "3/4", "Option B: 25". */
export function answerText(answer: Answer, content: QuestionContent): string {
  switch (answer.kind) {
    case "mcq": {
      const option = content.options?.find((candidate) => candidate.id === answer.correct);
      return option ? `Option ${answer.correct}: ${inlineText(option.c)}` : `Option ${answer.correct}`;
    }
    case "number":
      return answer.unit === "$" ? `$${answer.value}` : `${answer.value}${answer.unit ? ` ${answer.unit}` : ""}`;
    case "fraction":
      return answer.value;
    case "text":
      return answer.accepted.join(" or ");
  }
}
