"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import { BlockListView, QuestionView } from "@/components/paper/QuestionView";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MarkedPaper as MarkedPaperData, MarkedPaperEntry } from "@/application/queries/results";

/**
 * The marked paper (UX-07). On an iPad in landscape the paper takes about two thirds of the width and
 * the feedback for the chosen question sits beside it, so it feels like a returned paper. On a phone the
 * questions stack and the feedback opens as a sheet from the bottom. Mistakes come first, the ones that
 * cost the most marks first; the questions that were right can be opened but stay out of the way.
 *
 * Every mark is written (a tick or a cross and the marks), never shown by colour alone.
 */

function MarkBadge({ entry }: { entry: MarkedPaperEntry }) {
  return (
    <span
      data-mark
      className={`inline-flex min-h-8 items-center rounded-full border-2 px-3 text-base font-semibold ${
        entry.mistake ? "border-warning bg-warning-soft text-warning-strong" : "border-kaki bg-kaki-soft text-kaki-strong"
      }`}
    >
      {entry.markText}
      <span className="sr-only">{entry.mistake ? (entry.score > 0 ? " (partly right)" : " (not right)") : " (right)"}</span>
    </span>
  );
}

function PaperCard({
  entry,
  selected,
  child,
  onSelect,
  imageUrls,
}: {
  entry: MarkedPaperEntry;
  selected: boolean;
  child: boolean;
  onSelect: () => void;
  imageUrls: Record<string, string>;
}) {
  return (
    <article
      data-question={entry.position}
      data-selected={selected || undefined}
      className={`flex flex-col gap-3 border-2 bg-surface p-4 sm:p-5 ${child ? "rounded-3xl bg-child-card" : "rounded-2xl"} ${
        selected ? "border-kaki" : child ? "border-child-line" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Question ${entry.position}, ${entry.markText}. Show feedback`}
          className="flex min-h-12 items-center gap-2 rounded-lg text-left text-xl font-semibold text-ink underline-offset-4 hover:underline"
        >
          Question {entry.position}
        </button>
        <MarkBadge entry={entry} />
      </div>
      <QuestionView content={entry.content} imageUrls={imageUrls} className="text-base sm:text-lg" />
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-base text-ink-soft">{child ? "Your answer" : "Their answer"}</p>
        <p data-answer-line className="text-xl text-ink">
          {entry.answerLine}
        </p>
        {entry.workingUrl ? (
          // Private picture served through the app after an ownership check, so next/image would only proxy it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.workingUrl} alt={`Working for Question ${entry.position}`} className="w-full max-w-xl rounded-lg border border-line bg-white" />
        ) : null}
      </div>
    </article>
  );
}

function FeedbackPanel({
  entry,
  imageUrls,
  index,
  total,
  onPrevious,
  onNext,
  onClose,
}: {
  entry: MarkedPaperEntry;
  imageUrls: Record<string, string>;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-ink">Question {entry.position}</h2>
          <MarkBadge entry={entry} />
        </div>
        <button type="button" onClick={onClose} className="min-h-12 min-w-12 rounded-lg px-3 text-base font-semibold text-kaki underline underline-offset-4 lg:hidden">
          Close
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-ink">What happened</h3>
        <p data-what-happened className="text-lg text-ink">
          {entry.whatHappened}
        </p>
        {entry.explanation ? <p className="text-lg text-ink">{entry.explanation}</p> : null}
        {entry.parentNote ? <p className="text-base text-ink-soft">{entry.parentNote}</p> : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-ink">Worked solution</h3>
        <div data-worked-solution className="text-lg text-ink">
          <BlockListView blocks={entry.workedSolution} imageUrls={imageUrls} />
        </div>
        <p className="text-lg text-ink">
          <span className="font-semibold">Answer: </span>
          {entry.correctAnswer}
        </p>
      </div>
      {entry.mistake ? (
        <ButtonLink href={entry.tryHref} variant="primary" className="w-full sm:w-auto sm:self-start">
          Try one like this
        </ButtonLink>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <button type="button" onClick={onPrevious} disabled={index === 0} className="min-h-12 min-w-12 rounded-lg border-2 border-line px-4 text-base font-semibold text-ink disabled:opacity-40">
          Previous
        </button>
        <span className="text-base text-ink-soft">
          {index + 1} of {total}
        </span>
        <button type="button" onClick={onNext} disabled={index === total - 1} className="min-h-12 min-w-12 rounded-lg border-2 border-line px-4 text-base font-semibold text-ink disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}

export function MarkedPaper({ paper, finishAction }: { paper: MarkedPaperData; finishAction: () => Promise<void> }): ReactElement {
  const child = paper.audience === "child";
  const [selected, setSelected] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const entries = paper.entries;
  const mistakes = entries.filter((entry) => entry.mistake);
  const right = entries.filter((entry) => !entry.mistake);
  const current = entries[selected] as MarkedPaperEntry;
  const indexOf = (entry: MarkedPaperEntry) => entries.indexOf(entry);
  const choose = (index: number) => {
    setSelected(index);
    setSheetOpen(true);
  };

  return (
    <div data-wide-page className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={paper.backHref} className="inline-flex min-h-12 items-center text-base font-semibold text-kaki underline underline-offset-4">
          Back to {child ? "my results" : "results"}
        </Link>
        <h1 className={`${child ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"} font-semibold tracking-tight text-ink`}>Marked paper</h1>
        <p className="text-lg text-ink-soft">
          {paper.label}
          {paper.mistakeCount > 0
            ? paper.mistakeCount === 1
              ? " · 1 question to go through"
              : ` · ${paper.mistakeCount} questions to go through`
            : " · Every question was right"}
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:items-start lg:gap-8">
        <section aria-label="Paper" data-paper-side className="flex min-w-0 flex-col gap-4">
          {mistakes.length > 0 ? (
            <div className="flex flex-col gap-4" data-mistakes>
              <h2 className="text-xl font-semibold text-ink">{child ? "Let's look at these first" : "Worth going through first"}</h2>
              {mistakes.map((entry) => (
                <PaperCard key={entry.position} entry={entry} selected={indexOf(entry) === selected} child={child} onSelect={() => choose(indexOf(entry))} imageUrls={paper.imageUrls} />
              ))}
            </div>
          ) : null}
          {right.length > 0 ? (
            <details className="flex flex-col gap-4" data-right-answers>
              <summary className="flex min-h-12 cursor-pointer items-center text-xl font-semibold text-ink">
                {child ? `Questions you got right (${right.length})` : `Questions that were right (${right.length})`}
              </summary>
              <div className="flex flex-col gap-4 pt-3">
                {right.map((entry) => (
                  <PaperCard key={entry.position} entry={entry} selected={indexOf(entry) === selected} child={child} onSelect={() => choose(indexOf(entry))} imageUrls={paper.imageUrls} />
                ))}
              </div>
            </details>
          ) : null}
          {mistakes.length > 0 ? (
            <form action={finishAction} className="pt-2">
              <SubmitButton variant="secondary" className="w-full sm:w-auto">
                {child ? "I've been through my mistakes" : "We've been through the mistakes"}
              </SubmitButton>
            </form>
          ) : null}
        </section>

        {sheetOpen ? (
          <button type="button" aria-label="Close feedback" onClick={() => setSheetOpen(false)} className="fixed inset-0 z-30 bg-black/30 lg:hidden" />
        ) : null}
        <aside
          aria-label="Feedback"
          data-feedback-panel
          data-open={sheetOpen || undefined}
          className={`${
            sheetOpen
              ? "fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] overflow-y-auto rounded-t-3xl border-t-2 border-line bg-surface p-5 shadow-2xl"
              : "hidden"
          } lg:sticky lg:top-20 lg:z-auto lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-2xl lg:border-2 lg:border-line lg:bg-surface lg:p-5 lg:shadow-none ${child ? "lg:rounded-3xl lg:border-child-line" : ""}`}
        >
          <FeedbackPanel
            entry={current}
            imageUrls={paper.imageUrls}
            index={selected}
            total={entries.length}
            onPrevious={() => setSelected((value) => Math.max(0, value - 1))}
            onNext={() => setSelected((value) => Math.min(entries.length - 1, value + 1))}
            onClose={() => setSheetOpen(false)}
          />
        </aside>
      </div>
    </div>
  );
}
