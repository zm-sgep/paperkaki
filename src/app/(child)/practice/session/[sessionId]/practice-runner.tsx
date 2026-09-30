"use client";

import { useEffect, useRef, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { McqAnswer } from "@/components/mock/McqAnswer";
import { TypedAnswer } from "@/components/mock/TypedAnswer";
import { BlockListView, QuestionView } from "@/components/paper/QuestionView";
import { Button } from "@/components/ui/button";
import type { PracticeFeedback } from "@/application/commands/practice";
import type { PracticeDot, PracticeQuestionView } from "@/application/queries/practice";
import { FEEDBACK_HEADING, nextButtonLabel } from "@/domain/recommendations/practice-copy";
import { checkAnswerAction, finishAction, similarAction } from "./actions";

type Props = {
  sessionId: string;
  focusLabel: string;
  progressText: string;
  dots: PracticeDot[];
  question: PracticeQuestionView;
};

function Dots({ dots, progressText }: { dots: PracticeDot[]; progressText: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p data-progress className="text-xl font-semibold text-ink">
        {progressText}
      </p>
      <ol aria-hidden="true" className="flex flex-wrap gap-2">
        {dots.map((dot) => (
          <li
            key={dot.position}
            data-dot={dot.state}
            data-current={dot.current || undefined}
            className={`h-4 w-4 rounded-full border-2 ${
              dot.current ? "h-5 w-5 border-kaki bg-child-card ring-2 ring-kaki/40" : dot.state === "todo" ? "border-child-line bg-child-card" : "border-kaki bg-kaki"
            }`}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * One question at a time. The child writes or chooses an answer and presses "Check answer"; the answer is
 * marked by rule on the server and the feedback appears at once. After a wrong answer they get a hint first
 * (the first step), can ask "Show how" for the whole solution, and can try one like it. Points and streaks
 * never appear here.
 */
export function PracticeRunner({ sessionId, focusLabel, progressText, dots, question }: Props): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const { input } = question;
  const isMcq = input.kind === "mcq";
  const hasAnswer = isMcq ? selected !== null : typed.trim() !== "";
  const unit = input.kind === "number" ? input.unit : undefined;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  function check() {
    setError(null);
    startTransition(async () => {
      const result = await checkAnswerAction(sessionId, question.position, { selected: isMcq ? selected : null, typed: isMcq ? null : typed });
      if (result.ok) setFeedback(result.feedback);
      else setError(result.error);
    });
  }

  function next() {
    if (feedback?.isLast) {
      startTransition(async () => {
        await finishAction(sessionId);
      });
      return;
    }
    startTransition(() => router.refresh());
  }

  function similar() {
    setError(null);
    startTransition(async () => {
      const result = await similarAction(sessionId, question.position);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight text-ink outline-none sm:text-4xl">
          {focusLabel}
        </h1>
        <Dots dots={dots} progressText={progressText} />
      </div>

      <section aria-label="Question" data-question-card className="flex flex-col gap-5 rounded-3xl border-2 border-child-line bg-child-card p-5 sm:p-8">
        <QuestionView content={question.content} imageUrls={question.imageUrls} className="text-xl sm:text-2xl" />

        {feedback ? null : isMcq ? (
          <McqAnswer questionId={`practice-${question.position}`} options={question.content.options ?? []} value={selected ?? undefined} onChange={setSelected} />
        ) : (
          <TypedAnswer kind={input.kind === "fraction" ? "fraction" : input.kind === "text" ? "text" : "number"} value={typed} onChange={setTyped} unit={unit} />
        )}

        {error ? (
          <p role="alert" className="text-lg font-semibold text-danger">
            {error}
          </p>
        ) : null}

        {feedback ? null : (
          <Button type="button" variant="primary" disabled={!hasAnswer} loading={pending} onClick={check} className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto sm:self-start">
            Check answer
          </Button>
        )}
      </section>

      {feedback ? (
        <section
          ref={feedbackRef}
          tabIndex={-1}
          aria-live="polite"
          data-feedback={feedback.result}
          className={`flex flex-col gap-4 rounded-3xl border-2 p-5 outline-none sm:p-8 ${feedback.result === "right" ? "border-kaki bg-kaki-soft" : "border-warning bg-warning-soft"}`}
        >
          <h2 data-feedback-heading className="text-3xl font-semibold text-ink">
            {FEEDBACK_HEADING[feedback.result]}
          </h2>
          {feedback.result !== "right" && feedback.hint ? (
            <div data-hint className="flex flex-col gap-1">
              <h3 className="text-xl font-semibold text-ink">A hint</h3>
              <div className="text-xl text-ink">
                {feedback.hint.kind === "step" ? <BlockListView blocks={feedback.hint.blocks} imageUrls={question.imageUrls} /> : <p>{feedback.hint.text}</p>}
              </div>
            </div>
          ) : null}
          {showHow ? (
            <div data-solution className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold text-ink">Here is how</h3>
              <div className="text-xl text-ink">
                <BlockListView blocks={feedback.solution} imageUrls={question.imageUrls} />
              </div>
              <p className="text-xl text-ink">
                <span className="font-semibold">Answer: </span>
                {feedback.correctAnswer}
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-lg font-semibold text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="primary" loading={pending} onClick={next} className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
              {nextButtonLabel(feedback.isLast)}
            </Button>
            {feedback.result !== "right" && !showHow ? (
              <Button type="button" variant="secondary" onClick={() => setShowHow(true)} className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
                Show how
              </Button>
            ) : null}
            {feedback.result !== "right" && feedback.canTryLike ? (
              <Button type="button" variant="secondary" disabled={pending} onClick={similar} className="min-h-14 w-full rounded-2xl px-8 text-xl sm:w-auto">
                Try one like this
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
