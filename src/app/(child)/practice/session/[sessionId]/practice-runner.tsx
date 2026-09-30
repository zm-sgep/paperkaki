"use client";

import { BookOpenCheck, Lightbulb, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactElement, type ReactNode } from "react";
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

/** Where the child is in the set. Decorative: the words above the dots say it. A wrong answer is a warm dot, never a red one. */
function Dots({ dots, progressText }: { dots: PracticeDot[]; progressText: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p data-progress className="text-xl font-bold text-ink">
        {progressText}
      </p>
      <ol aria-hidden="true" className="flex flex-wrap items-center gap-2.5">
        {dots.map((dot) => (
          <li
            key={dot.position}
            data-dot={dot.state}
            data-current={dot.current || undefined}
            className={`shrink-0 rounded-full transition-all ${
              dot.current
                ? "h-6 w-6 border-[3px] border-kaki bg-child-card ring-4 ring-kaki/20"
                : dot.state === "todo"
                  ? "h-4 w-4 bg-child-line"
                  : dot.state === "right"
                    ? "h-4 w-4 bg-kaki"
                    : "h-4 w-4 bg-kaya"
            }`}
          />
        ))}
      </ol>
    </div>
  );
}

const PANEL: Record<PracticeFeedback["result"], { box: string; heading: string; icon: string }> = {
  right: { box: "border-kaki/30 bg-kaki-soft", heading: "text-kaki-strong", icon: "bg-kaya text-ink" },
  wrong: { box: "border-coral/40 bg-coral-soft", heading: "text-coral-strong", icon: "bg-coral text-white" },
  unclear: { box: "border-kaya/50 bg-kaya-soft", heading: "text-kaya-strong", icon: "bg-kaya text-ink" },
};

/** A white card inside the feedback panel: "A hint" or "Here is how". */
function PanelNote({ icon, title, children, ...marker }: { icon: ReactElement; title: string; children: ReactNode; "data-hint"?: boolean; "data-solution"?: boolean }) {
  return (
    <div {...marker} className="flex flex-col gap-2 rounded-2xl border border-child-line bg-child-card p-4 sm:p-5">
      <h3 className="flex items-center gap-2.5 text-xl font-extrabold text-ink">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kaya-soft text-kaya-strong [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
        {title}
      </h3>
      {children}
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

  const panel = feedback ? PANEL[feedback.result] : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="text-[2rem] font-extrabold leading-tight tracking-tight text-ink outline-none sm:text-4xl">
          {focusLabel}
        </h1>
        <Dots dots={dots} progressText={progressText} />
      </div>

      <section aria-label="Question" data-question-card className="flex flex-col gap-6 rounded-3xl border border-child-line bg-child-card p-5 shadow-child sm:p-8">
        <QuestionView content={isMcq ? { stem: question.content.stem } : question.content} imageUrls={question.imageUrls} className="text-xl sm:text-2xl" />

        {feedback ? null : isMcq ? (
          <McqAnswer questionId={`practice-${question.position}`} options={question.content.options ?? []} value={selected ?? undefined} onChange={setSelected} shape="soft" />
        ) : (
          <TypedAnswer kind={input.kind === "fraction" ? "fraction" : input.kind === "text" ? "text" : "number"} value={typed} onChange={setTyped} unit={unit} shape="soft" />
        )}

        {error && !feedback ? (
          <p role="alert" className="text-lg font-semibold text-danger">
            {error}
          </p>
        ) : null}

        {feedback ? null : (
          <Button type="button" variant="primary" size="xl" shape="pill" disabled={!hasAnswer} loading={pending} onClick={check} className="w-full sm:w-auto sm:self-start">
            Check answer
          </Button>
        )}
      </section>

      {feedback && panel ? (
        <section
          ref={feedbackRef}
          tabIndex={-1}
          aria-live="polite"
          data-feedback={feedback.result}
          className={`flex flex-col gap-5 rounded-3xl border p-5 shadow-child outline-none motion-safe:animate-enter sm:p-8 ${panel.box}`}
        >
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${panel.icon}`}>
              {feedback.result === "right" ? <Sparkles className="h-6 w-6" strokeWidth={2.25} /> : <Lightbulb className="h-6 w-6" strokeWidth={2.25} />}
            </span>
            <h2 data-feedback-heading className={`text-3xl font-extrabold leading-tight tracking-tight ${panel.heading}`}>
              {FEEDBACK_HEADING[feedback.result]}
            </h2>
          </div>
          {feedback.result !== "right" && feedback.hint ? (
            <PanelNote icon={<Lightbulb />} title="A hint" data-hint>
              <div className="text-xl text-ink">
                {feedback.hint.kind === "step" ? <BlockListView blocks={feedback.hint.blocks} imageUrls={question.imageUrls} /> : <p>{feedback.hint.text}</p>}
              </div>
            </PanelNote>
          ) : null}
          {showHow ? (
            <PanelNote icon={<BookOpenCheck />} title="Here is how" data-solution>
              <div className="text-xl text-ink">
                <BlockListView blocks={feedback.solution} imageUrls={question.imageUrls} />
              </div>
              <p className="text-xl text-ink">
                <span className="font-bold">Answer: </span>
                {feedback.correctAnswer}
              </p>
            </PanelNote>
          ) : null}
          {error ? (
            <p role="alert" className="text-lg font-semibold text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button type="button" variant="primary" size="xl" shape="pill" loading={pending} onClick={next} className="w-full sm:w-auto">
              {nextButtonLabel(feedback.isLast)}
            </Button>
            {feedback.result !== "right" && !showHow ? (
              <Button type="button" variant="secondary" size="lg" shape="pill" onClick={() => setShowHow(true)} className="w-full sm:w-auto">
                Show how
              </Button>
            ) : null}
            {feedback.result !== "right" && feedback.canTryLike ? (
              <Button type="button" variant="secondary" size="lg" shape="pill" disabled={pending} onClick={similar} className="w-full sm:w-auto">
                Try one like this
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
