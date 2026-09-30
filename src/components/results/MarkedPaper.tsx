"use client";

import { ArrowLeft, BookOpenCheck, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import { BlockListView, QuestionView } from "@/components/paper/QuestionView";
import { Button, ButtonLink, buttonClassName } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MarkedPaper as MarkedPaperData, MarkedPaperEntry } from "@/application/queries/results";

/**
 * The marked paper (UX-07). On an iPad in landscape the paper takes about two thirds of the width and
 * the feedback for the chosen question sits beside it, so it feels like a returned paper. On a phone the
 * questions stack and the feedback opens as a sheet from the bottom. Mistakes come first, the ones that
 * cost the most marks first; the questions that were right can be opened but stay out of the way.
 *
 * Every mark is written (a tick or a cross and the marks), never shown by colour alone: the tint of the
 * badge only supports the words.
 */

function MarkBadge({ entry, child }: { entry: MarkedPaperEntry; child: boolean }) {
  const partly = entry.mistake && entry.score > 0;
  const tone = !entry.mistake
    ? "border-kaki/30 bg-kaki-soft text-kaki-strong"
    : partly
      ? "border-kaya/50 bg-kaya-soft text-kaya-strong"
      : "border-coral/40 bg-coral-soft text-coral-strong";
  return (
    <span
      data-mark
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-base font-extrabold ${child ? "text-lg" : ""} ${tone}`}
    >
      {entry.markText}
      <span className="sr-only">{entry.mistake ? (entry.score > 0 ? " (partly right)" : " (not right)") : " (right)"}</span>
    </span>
  );
}

/** One question as a returned exam sheet: a white card, the question number and the mark in the corner, what was written underneath. */
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
      className={`flex flex-col gap-4 border bg-surface p-4 shadow-card transition-[border-color,box-shadow] sm:p-6 ${child ? "rounded-3xl" : "rounded-2xl"} ${
        selected ? "border-kaki ring-[3px] ring-kaki/20" : child ? "border-child-line" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line pb-3">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Question ${entry.position}, ${entry.markText}. Show feedback`}
          className="flex min-h-12 items-center gap-2 rounded-lg text-left text-xl font-extrabold text-ink underline-offset-4 hover:underline"
        >
          Question {entry.position}
        </button>
        <MarkBadge entry={entry} child={child} />
      </div>
      <QuestionView content={entry.content} imageUrls={imageUrls} className="text-base sm:text-lg" />
      <div className="flex flex-col gap-1.5 rounded-xl bg-paper p-4">
        <p className="text-base font-semibold text-ink-soft">{child ? "Your answer" : "Their answer"}</p>
        <p data-answer-line className="text-xl font-semibold text-ink">
          {entry.answerLine}
        </p>
        {entry.workingUrl ? (
          // Private picture served through the app after an ownership check, so next/image would only proxy it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.workingUrl} alt={`Working for Question ${entry.position}`} className="mt-1 w-full max-w-xl rounded-lg border border-line bg-white" />
        ) : null}
      </div>
    </article>
  );
}

function FeedbackPanel({
  entry,
  child,
  imageUrls,
  index,
  total,
  onPrevious,
  onNext,
  onClose,
}: {
  entry: MarkedPaperEntry;
  child: boolean;
  imageUrls: Record<string, string>;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const shape = child ? "pill" : "control";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-2">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">Question {entry.position}</h2>
          <MarkBadge entry={entry} child={child} />
        </div>
        <Button type="button" variant="quiet" size="sm" shape={shape} onClick={onClose} className="lg:hidden">
          <X aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
          Close
        </Button>
      </div>
      <div className="flex flex-col gap-2 rounded-xl bg-paper p-4">
        <h3 className="text-base font-bold text-ink">What happened</h3>
        <p data-what-happened className="text-lg text-ink">
          {entry.whatHappened}
        </p>
        {entry.explanation ? <p className="text-lg text-ink">{entry.explanation}</p> : null}
        {entry.parentNote ? <p className="text-base text-ink-soft">{entry.parentNote}</p> : null}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-kaki/20 bg-kaki-soft p-4">
        <h3 className="text-base font-bold text-ink">Worked solution</h3>
        <div data-worked-solution className="text-lg text-ink">
          <BlockListView blocks={entry.workedSolution} imageUrls={imageUrls} />
        </div>
        <p className="flex items-start gap-2.5 text-lg text-ink">
          <BookOpenCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-kaki-strong" strokeWidth={2.25} />
          <span>
            <span className="font-bold">Answer: </span>
            {entry.correctAnswer}
          </span>
        </p>
      </div>
      {entry.mistake ? (
        <ButtonLink href={entry.tryHref} variant="primary" shape={shape} className="w-full sm:w-auto sm:self-start">
          Try one like this
        </ButtonLink>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button type="button" variant="secondary" size="sm" shape={shape} onClick={onPrevious} disabled={index === 0}>
          <ChevronLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
          Previous
        </Button>
        <span className="text-base text-ink-soft">
          {index + 1} of {total}
        </span>
        <Button type="button" variant="secondary" size="sm" shape={shape} onClick={onNext} disabled={index === total - 1}>
          Next
          <ChevronRight aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
        </Button>
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
    <div data-wide-page className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-2">
        <Link href={paper.backHref} className={buttonClassName("quiet", "md", { shape: child ? "pill" : "control", flush: true })}>
          <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
          Back to {child ? "my results" : "results"}
        </Link>
        <h1 className={`${child ? "text-[2rem] font-extrabold sm:text-4xl" : "text-[1.75rem] font-bold sm:text-[2rem]"} leading-tight tracking-tight text-ink`}>Marked paper</h1>
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
              <h2 className="text-xl font-extrabold text-ink">{child ? "Let's look at these first" : "Worth going through first"}</h2>
              {mistakes.map((entry) => (
                <PaperCard key={entry.position} entry={entry} selected={indexOf(entry) === selected} child={child} onSelect={() => choose(indexOf(entry))} imageUrls={paper.imageUrls} />
              ))}
            </div>
          ) : null}
          {right.length > 0 ? (
            <details className={`group/details flex flex-col border bg-surface p-4 shadow-card sm:p-5 ${child ? "rounded-3xl border-child-line" : "rounded-2xl border-line"}`} data-right-answers>
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-xl font-extrabold text-ink [&::-webkit-details-marker]:hidden">
                {child ? `Questions you got right (${right.length})` : `Questions that were right (${right.length})`}
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kaki-soft text-kaki-strong transition-transform group-open/details:rotate-180">
                  <ChevronDown className="h-5 w-5" strokeWidth={2.5} />
                </span>
              </summary>
              <div className="flex flex-col gap-4 pt-4">
                {right.map((entry) => (
                  <PaperCard key={entry.position} entry={entry} selected={indexOf(entry) === selected} child={child} onSelect={() => choose(indexOf(entry))} imageUrls={paper.imageUrls} />
                ))}
              </div>
            </details>
          ) : null}
          {mistakes.length > 0 ? (
            <form action={finishAction} className="pt-2">
              <SubmitButton variant="secondary" size={child ? "lg" : "md"} shape={child ? "pill" : "control"} className="w-full sm:w-auto">
                {child ? "I've been through my mistakes" : "We've been through the mistakes"}
              </SubmitButton>
            </form>
          ) : null}
        </section>

        {sheetOpen ? (
          <button type="button" aria-label="Close feedback" onClick={() => setSheetOpen(false)} className="fixed inset-0 z-30 bg-ink/30 lg:hidden" />
        ) : null}
        <aside
          aria-label="Feedback"
          data-feedback-panel
          data-open={sheetOpen || undefined}
          className={`${
            sheetOpen
              ? "fixed inset-x-0 bottom-0 z-40 max-h-[80dvh] overflow-y-auto rounded-t-hero border-t border-line bg-surface p-5 pt-3 shadow-2xl"
              : "hidden"
          } lg:sticky lg:top-20 lg:z-auto lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-6 lg:shadow-card ${child ? "lg:rounded-3xl lg:border-child-line" : ""}`}
        >
          {sheetOpen ? <span aria-hidden="true" className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-line lg:hidden" /> : null}
          <FeedbackPanel
            entry={current}
            child={child}
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
