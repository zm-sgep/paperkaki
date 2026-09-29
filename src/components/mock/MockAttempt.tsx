"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { QuestionView } from "@/components/paper/QuestionView";
import { questionStatuses, type MockAttemptSnapshot } from "./attempt-state";
import { HandwritingCanvas } from "./HandwritingCanvas";
import { McqAnswer } from "./McqAnswer";
import { MockModeLayout } from "./MockModeLayout";
import { ModalDialog } from "./ModalDialog";
import { FlagButton, QuestionNavigator } from "./QuestionNavigator";
import { SubmitReview } from "./SubmitReview";
import { TypedAnswer } from "./TypedAnswer";
import { serialiseStrokes } from "./stroke-model";
import type { MockPaper, MockQuestion } from "./types";
import { useIsClient } from "./use-is-client";
import { useMockAttemptState } from "./use-mock-attempt-state";

/**
 * A whole mock on the pupil's screen: question, answer, working, previous/next, the question list
 * and the check-and-submit step. It shows no correctness, points or hints, and offers no way out
 * to the rest of the app except "Stop for now" from the End dialog (which the caller handles).
 *
 * It only records what the pupil did. Handing the paper in (and any marking) is the caller's job
 * through `onSubmit`.
 */

export type MockAttemptProps = {
  paper: MockPaper;
  /** Short-lived signed image URLs by asset key, when a question has a picture. */
  imageUrls?: Readonly<Record<string, string>>;
  /** A copy saved on the server; the newer of this and the device copy is used. */
  initialSnapshot?: MockAttemptSnapshot | null;
  /** Called after each change, debounced. Server persistence plugs in here later. */
  onSave?: (snapshot: MockAttemptSnapshot) => void;
  /** Hand the paper in. Throwing keeps the pupil on the review screen with their answers safe. */
  onSubmit?: (snapshot: MockAttemptSnapshot) => Promise<void> | void;
  /** "Stop for now" from the End dialog. */
  onLeave?: () => void;
  /** What to show after the paper is handed in, e.g. a button to the next step. */
  submittedAction?: ReactNode;
};

type Phase = "answering" | "review" | "submitted";

/** Server-render and hydrate a calm placeholder, then start on the client where this device's saved copy can be read. */
export function MockAttempt(props: MockAttemptProps): ReactElement {
  const isClient = useIsClient();
  if (!isClient) {
    return (
      <div data-mock-mode-loading className="flex h-dvh items-center justify-center bg-paper p-6 text-lg text-ink-soft" role="status">
        Getting your paper ready&hellip;
      </div>
    );
  }
  return <MockAttemptSession {...props} />;
}

function MockAttemptSession({ paper, imageUrls, initialSnapshot, onSave, onSubmit, onLeave, submittedAction }: MockAttemptProps): ReactElement {
  const questionIds = useMemo(() => paper.questions.map((q) => q.id), [paper.questions]);
  const [phase, setPhase] = useState<Phase>("answering");
  const [listOpen, setListOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  const attempt = useMockAttemptState({
    attemptId: paper.attemptId,
    questionIds,
    durationSeconds: paper.durationMinutes * 60,
    ...(onSave ? { onSave } : {}),
    initialSnapshot: initialSnapshot ?? null,
    clockStopped: phase === "submitted",
  });
  const { state, actions } = attempt;

  const question: MockQuestion | undefined = paper.questions[state.current];
  const statuses = questionStatuses(state);
  const total = paper.questions.length;

  // After moving to another question, put focus on it so keyboard and screen-reader users land there.
  const questionRef = useRef<HTMLElement>(null);
  const currentIndex = state.current;
  const shownRef = useRef(`${currentIndex}:${phase}`);
  useEffect(() => {
    const shown = `${currentIndex}:${phase}`;
    if (shownRef.current === shown) return;
    shownRef.current = shown;
    questionRef.current?.focus({ preventScroll: true });
  }, [currentIndex, phase]);

  const goTo = (index: number) => {
    actions.goTo(index);
    setPhase("answering");
    setListOpen(false);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      attempt.flush();
      await onSubmit?.(attempt.snapshot());
      attempt.clearSaved();
      setPhase("submitted");
    } catch {
      setSubmitError("We couldn't hand in your paper just now. Your answers are safe. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!question) {
    return (
      <p role="alert" className="p-6 text-lg">
        This paper has no questions.
      </p>
    );
  }

  if (phase === "submitted") {
    return (
      <div data-mock-mode data-mock-submitted className="flex h-dvh flex-col items-center justify-center gap-4 bg-paper p-6 text-center text-ink">
        <h1 className="text-3xl font-semibold">Your paper is handed in</h1>
        <p className="max-w-md text-lg text-ink-soft">Well done for finishing. You can put the iPad down now.</p>
        {submittedAction}
      </div>
    );
  }

  const isLast = state.current === total - 1;

  return (
    <MockModeLayout
      title={paper.title}
      progressLabel={phase === "review" ? "Check your paper" : `Question ${state.current + 1} of ${total}`}
      progress={phase === "review" ? 1 : (state.current + 1) / total}
      remainingSeconds={attempt.remainingSeconds}
      onLeave={() => onLeave?.()}
      onReview={() => setPhase("review")}
      footer={
        phase === "answering" ? (
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2">
            <Button variant="secondary" onClick={actions.previous} disabled={state.current === 0} aria-label="Previous question" className="min-h-14">
              <Arrow direction="left" />
              Previous
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <FlagButton compact number={state.current + 1} flagged={statuses[state.current]?.flagged ?? false} onToggle={() => actions.toggleFlag(question.id)} />
              <button
                type="button"
                onClick={() => setListOpen(true)}
                className="inline-flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-kaki"
              >
                <GridIcon />
                Questions
              </button>
            </div>
            {isLast ? (
              <Button onClick={() => setPhase("review")} className="min-h-14">
                Check your paper
              </Button>
            ) : (
              <Button onClick={actions.next} aria-label="Next question" className="min-h-14">
                Next
                <Arrow direction="right" />
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {phase === "review" ? (
        <SubmitReview
          statuses={statuses}
          onJump={goTo}
          onBack={() => goTo(state.current)}
          onSubmit={submit}
          submitting={submitting}
          error={submitError}
        />
      ) : (
        <div className="flex flex-1 flex-col p-3 sm:p-4">
          <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 min-[900px]:landscape:grid-cols-[62fr_38fr] min-[900px]:landscape:grid-rows-[auto_minmax(0,1fr)]">
            <section
              ref={questionRef}
              tabIndex={-1}
              style={{ outline: "none" }}
              aria-label={`Question ${state.current + 1}`}
              data-question-surface
              className="rounded-xl border-2 border-line bg-white p-5 text-black shadow-sm outline-none min-[900px]:landscape:col-start-1 min-[900px]:landscape:row-span-2 min-[900px]:landscape:row-start-1 min-[900px]:landscape:self-start sm:p-7 [&_[data-question-view]]:text-xl"
            >
              <QuestionView
                number={state.current + 1}
                marks={question.marks}
                content={withoutOptions(question)}
                {...(imageUrls ? { imageUrls } : {})}
              />
            </section>

            <section
              aria-label="Answer"
              data-answer-panel
              className="rounded-xl border-2 border-line bg-surface p-5 min-[900px]:landscape:col-start-2 min-[900px]:landscape:row-start-1"
            >
              <AnswerControl
                question={question}
                response={state.responses[question.id]}
                onSelect={(option) => actions.select(question.id, option)}
                onType={(text) => actions.type(question.id, text)}
              />
            </section>

            {question.working ? (
              <section aria-label="Working space" className="flex min-h-0 flex-col gap-2 min-[900px]:landscape:col-start-2 min-[900px]:landscape:row-start-2">
                <h2 className="text-lg font-semibold text-ink">Working</h2>
                <HandwritingCanvas
                  key={question.id}
                  label={`Working space for question ${state.current + 1}`}
                  initialStrokes={state.responses[question.id]?.strokes ?? null}
                  onChange={(strokes) => actions.setStrokes(question.id, serialiseStrokes(strokes))}
                  className="flex-1"
                />
              </section>
            ) : null}
          </div>
        </div>
      )}

      <ModalDialog open={listOpen} onClose={() => setListOpen(false)} title="All questions" wide>
        <QuestionNavigator statuses={statuses} currentIndex={state.current} onGoTo={goTo} onToggleFlag={actions.toggleFlag} />
        <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
          <Button
            onClick={() => {
              setListOpen(false);
              setPhase("review");
            }}
          >
            Check your paper
          </Button>
          <Button variant="secondary" onClick={() => setListOpen(false)}>
            Back to question {state.current + 1}
          </Button>
        </div>
      </ModalDialog>
    </MockModeLayout>
  );
}

/** The answer cards show the options, so the question text does not list them a second time. */
function withoutOptions(question: MockQuestion) {
  return { stem: question.content.stem };
}

function AnswerControl({
  question,
  response,
  onSelect,
  onType,
}: {
  question: MockQuestion;
  response: { selected?: "A" | "B" | "C" | "D"; typed?: string } | undefined;
  onSelect: (option: "A" | "B" | "C" | "D" | null) => void;
  onType: (text: string) => void;
}): ReactElement {
  const { input } = question;
  if (input.kind === "mcq") {
    return <McqAnswer questionId={question.id} options={question.content.options ?? []} value={response?.selected} onChange={onSelect} />;
  }
  return (
    <TypedAnswer
      key={question.id}
      kind={input.kind}
      value={response?.typed ?? ""}
      onChange={onType}
      unit={input.kind === "number" ? input.unit : undefined}
    />
  );
}

function Arrow({ direction }: { direction: "left" | "right" }): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function GridIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}
