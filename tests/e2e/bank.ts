import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The question bank as the browser tests see it, so a test can answer a question it is shown: the app never
 * puts the answer on the page before it is asked for. Questions are found by their words.
 */

type Inline = { t: "text"; v: string } | { t: "frac"; n: number; d: number; whole?: number } | { t: "blank" };
type Block = { t: string; c?: Inline[] };
type RawQuestion = {
  primaryOutcomeCode: string;
  questionType: "mcq" | "number" | "fraction" | "text";
  content: { stem: Block[]; options?: { id: string; c: Inline[] }[] };
  answer: { kind: string; correct?: string; value?: string; accepted?: string[] };
};
type RawCurriculum = { domains: { topics: { parentLabel: string; outcomes: { code: string }[] }[] }[] };

export type BankQuestion = {
  kind: RawQuestion["questionType"];
  topicLabel: string;
  /** The right thing to give: an option index (0 to 3) for multiple choice, otherwise the text to type. */
  right: { option: number } | { typed: string };
  /** Something wrong to give, or null when a wrong answer would need a person to look at it (words). */
  wrong: { option: number } | { typed: string } | null;
};

const root = path.resolve(process.cwd(), "content");
const flat = (text: string) => text.replace(/\s+/g, "");

const curriculum = JSON.parse(readFileSync(path.join(root, "curriculum/p3-maths-moe-2025-10.json"), "utf8")) as RawCurriculum;
const topicOfOutcome = new Map(curriculum.domains.flatMap((d) => d.topics.flatMap((t) => t.outcomes.map((o) => [o.code, t.parentLabel] as const))));

/** A paragraph as the page shows it, in pieces: a fraction reads "n over d" and then stacked, a blank splits the text. */
function segmentsOf(inlines: readonly Inline[]): string[] {
  const segments: string[] = [];
  let current = "";
  for (const inline of inlines) {
    if (inline.t === "text") current += inline.v;
    else if (inline.t === "frac") current += `${inline.whole ?? ""}${inline.n}over${inline.d}${inline.n}${inline.d}`;
    else {
      segments.push(current);
      current = "";
    }
  }
  segments.push(current);
  return segments.map(flat).filter((segment) => segment !== "");
}

type Entry = { segments: string[]; options: string[]; question: BankQuestion };

const entries: Entry[] = readdirSync(path.join(root, "questions"))
  .filter((name) => name.endsWith(".json"))
  .flatMap((name) => JSON.parse(readFileSync(path.join(root, "questions", name), "utf8")) as RawQuestion[])
  .map((raw): Entry => {
    const options = (raw.content.options ?? []).map((option) => segmentsOf(option.c).join(""));
    const kind = raw.questionType;
    const optionIndex = raw.answer.kind === "mcq" ? "ABCD".indexOf(raw.answer.correct ?? "A") : 0;
    const right: BankQuestion["right"] = kind === "mcq" ? { option: optionIndex } : { typed: kind === "text" ? (raw.answer.accepted?.[0] ?? "") : (raw.answer.value ?? "") };
    const wrong: BankQuestion["wrong"] = kind === "mcq" ? { option: optionIndex === 0 ? 1 : 0 } : kind === "number" ? { typed: "0.01" } : kind === "fraction" ? { typed: "1/99" } : null;
    return {
      segments: raw.content.stem.filter((block) => block.t === "p").flatMap((block) => segmentsOf(block.c ?? [])),
      options,
      question: { kind, topicLabel: topicOfOutcome.get(raw.primaryOutcomeCode) ?? "", right, wrong },
    };
  });

/**
 * The bank question whose words are all on the page, in order. `visibleText` is the question as shown, with
 * its choices when it has any. Throws when none matches, or when two match and give different answers.
 */
export function findBankQuestion(visibleText: string): BankQuestion {
  const page = flat(visibleText);
  const found: { entry: Entry; score: number }[] = [];
  for (const entry of entries) {
    let from = 0;
    let score = 0;
    let all = entry.segments.length > 0;
    for (const segment of entry.segments) {
      const at = page.indexOf(segment, from);
      if (at < 0) {
        all = false;
        break;
      }
      from = at + segment.length;
      score += segment.length;
    }
    if (all && entry.options.every((option) => page.includes(option))) found.push({ entry, score: score + entry.options.reduce((sum, option) => sum + option.length, 0) });
  }
  if (found.length === 0) throw new Error(`No question in the bank matches: ${visibleText.slice(0, 160)}`);
  found.sort((a, b) => b.score - a.score);
  const best = found[0]!;
  const same = found.filter((item) => item.score === best.score);
  // Questions the page cannot tell apart give the same answer, or the test could not have known.
  const answers = new Set(same.map((item) => JSON.stringify(item.entry.question.right)));
  if (answers.size > 1) throw new Error(`Several bank questions match and have different answers: ${visibleText.slice(0, 160)}`);
  return best.entry.question;
}
