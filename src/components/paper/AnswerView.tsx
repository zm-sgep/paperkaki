import type { ReactElement } from "react";
import type { Answer, QuestionContent, WorkedSolution } from "@/schemas/question-content";
import { BlockListView, FractionView, InlineRunView } from "./QuestionView";

/**
 * The answer and worked solution of a question, for admins and for the answer pack preview. Kept
 * apart from QuestionView so a pupil-facing screen can never show it by accident.
 */

function fractionParts(value: string): { whole?: number; n: number; d: number } {
  const [wholeOrFraction, fraction] = value.includes(" ") ? value.split(" ") : [undefined, value];
  const [n, d] = (fraction as string).split("/").map(Number) as [number, number];
  return wholeOrFraction === undefined ? { n, d } : { whole: Number(wholeOrFraction), n, d };
}

function AnswerText({ answer, content }: { answer: Answer; content: QuestionContent }): ReactElement {
  switch (answer.kind) {
    case "mcq": {
      const option = content.options?.find((o) => o.id === answer.correct);
      return (
        <span>
          Option {answer.correct}
          {option ? (
            <>
              {": "}
              <InlineRunView inlines={option.c} />
            </>
          ) : null}
        </span>
      );
    }
    case "number":
      return (
        <span>
          {answer.unit === "$" ? "$" : ""}
          {answer.value}
          {answer.unit && answer.unit !== "$" ? ` ${answer.unit}` : ""}
        </span>
      );
    case "fraction":
      return (
        <span>
          <FractionView inline={{ t: "frac", ...fractionParts(answer.value) }} />
          <span className="ml-2 text-sm text-ink-soft">
            {answer.requireSimplest ? "must be in simplest form" : answer.acceptEquivalent ? "equivalent fractions accepted" : "exact form only"}
          </span>
        </span>
      );
    case "text":
      return <span>{answer.accepted.join(" / ")}</span>;
  }
}

export function AnswerView({
  answer,
  content,
  workedSolution,
}: {
  answer: Answer;
  content: QuestionContent;
  workedSolution: WorkedSolution;
}): ReactElement {
  return (
    <div data-answer-view className="flex flex-col gap-3 text-lg text-ink">
      <p>
        <span className="font-semibold">Answer: </span>
        <AnswerText answer={answer} content={content} />
      </p>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-ink">Worked solution</h3>
        <BlockListView blocks={workedSolution} />
      </div>
    </div>
  );
}
