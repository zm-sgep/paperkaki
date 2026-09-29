import type { Inline, QuestionDraft } from "@/schemas/question-content";
import { QuestionError } from "./errors";
import type { VerificationResult } from "./verify";

/**
 * The life of one question version (ADR-0004, M2-04).
 *
 *   draft --submit--> in_review --approve--> approved --retire--> retired
 *                         |                      (any version that is not retired can be retired)
 *                         +--request changes--> draft
 *
 * Approved and retired versions never change: a correction is a new draft version.
 */

export const QUESTION_STATUSES = ["draft", "in_review", "approved", "retired"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const REVIEW_DECISIONS = ["approved", "changes_requested", "retired"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  retired: "Retired",
};

const TRANSITIONS: Record<QuestionStatus, readonly QuestionStatus[]> = {
  draft: ["in_review", "retired"],
  in_review: ["approved", "draft", "retired"],
  approved: ["retired"],
  retired: [],
};

export function canTransition(from: QuestionStatus, to: QuestionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: QuestionStatus, to: QuestionStatus): void {
  if (!canTransition(from, to)) {
    throw new QuestionError(
      "invalid_transition",
      `A ${QUESTION_STATUS_LABEL[from].toLowerCase()} question cannot become ${QUESTION_STATUS_LABEL[to].toLowerCase()}.`,
    );
  }
}

/** Only a draft can be edited in place. Anything else is corrected by creating a new version. */
export function isEditableInPlace(status: QuestionStatus): boolean {
  return status === "draft";
}

/** Only approved questions are ever candidates for paper generation. */
export function isGenerationCandidate(status: QuestionStatus): boolean {
  return status === "approved";
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type ReviewChecklist = {
  /** The question fits the curriculum outcome it is mapped to. */
  curriculum: boolean;
  /** The answer is correct. When the verifier cannot check it, this tick IS the human check. */
  answer: boolean;
  /** The wording is clear. */
  clarity: boolean;
  /** The wording and context suit the age group. */
  ageAppropriate: boolean;
};

export const CHECKLIST_LABELS: Record<keyof ReviewChecklist, string> = {
  curriculum: "The question fits the curriculum outcome",
  answer: "The answer is correct",
  clarity: "The wording is clear",
  ageAppropriate: "The wording and context suit the age group",
};

export const HUMAN_ANSWER_CHECK_NOTE =
  "Answer confirmed by the reviewer: no calculation is available to check it.";

export type ReviewInput = {
  decision: ReviewDecision;
  checklist: ReviewChecklist;
  notes: string;
  verification: VerificationResult;
};

export type ReviewOutcome =
  | { ok: true; notes: string | null }
  | { ok: false; reasons: string[] };

/**
 * Decides whether a review decision may be recorded.
 *  - Approve needs every checklist item ticked AND the deterministic verifier to pass. When the
 *    verifier says a person must check the answer, the `answer` tick is that check and is
 *    recorded in the notes.
 *  - Request changes and retire need a reason.
 */
export function decideReview(input: ReviewInput): ReviewOutcome {
  const notes = input.notes.trim();
  if (input.decision !== "approved") {
    return notes === ""
      ? { ok: false, reasons: [input.decision === "retired" ? "Say why this question is being retired." : "Say what needs to change."] }
      : { ok: true, notes };
  }

  const reasons: string[] = [];
  for (const key of Object.keys(CHECKLIST_LABELS) as (keyof ReviewChecklist)[]) {
    if (!input.checklist[key]) reasons.push(`Tick "${CHECKLIST_LABELS[key]}" once you have checked it.`);
  }
  if (!input.verification.ok) {
    reasons.push(...input.verification.reasons.map((reason) => `The automatic answer check failed: ${reason}.`));
  }
  if (reasons.length > 0) return { ok: false, reasons };

  const needsHuman = input.verification.ok && input.verification.needsHumanCheck === true;
  const combined = needsHuman ? [notes, HUMAN_ANSWER_CHECK_NOTE].filter((part) => part !== "").join(" ") : notes;
  return { ok: true, notes: combined === "" ? null : combined };
}

/** The verifier's result in plain words for the review page. */
export function describeVerification(result: VerificationResult): { tone: "good" | "human" | "bad"; lines: string[] } {
  if (!result.ok) {
    return { tone: "bad", lines: result.reasons };
  }
  if (result.needsHumanCheck) {
    return {
      tone: "human",
      lines: ["The answer cannot be checked by calculation, so a person must confirm it. Tick \"The answer is correct\" only after working it out yourself."],
    };
  }
  return { tone: "good", lines: ["The answer was checked by calculation and matches."] };
}

// ---------------------------------------------------------------------------
// Sameness
// ---------------------------------------------------------------------------

/** JSON with object keys sorted, so equal data always gives equal text (JSONB reorders keys). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Identity of a question's substance: everything a pupil sees or is marked on, plus its
 * classification and outcome mapping (not the family title, which belongs to the family). Two drafts with the same fingerprint are the same
 * question, whatever order their JSON keys or secondary outcomes were written in.
 */
export function questionFingerprint(draft: QuestionDraft): string {
  return canonicalJson({
    primaryOutcomeCode: draft.primaryOutcomeCode,
    secondaryOutcomeCodes: [...draft.secondaryOutcomeCodes].sort(),
    questionType: draft.questionType,
    difficulty: draft.difficulty,
    cognitiveDemand: draft.cognitiveDemand,
    marks: draft.marks,
    estimatedSeconds: draft.estimatedSeconds,
    content: draft.content,
    answer: draft.answer,
    verification: draft.verification,
    workedSolution: draft.workedSolution,
    markingScheme: draft.markingScheme,
    provenance: draft.provenance,
  });
}

/** Asset keys referenced by image blocks in the stem and worked solution. */
export function referencedAssetKeys(draft: Pick<QuestionDraft, "content" | "workedSolution">): string[] {
  const keys = new Set<string>();
  for (const block of [...draft.content.stem, ...draft.workedSolution]) {
    if (block.t === "image") keys.add(block.assetKey);
  }
  return [...keys].sort();
}

/** Plain text of an inline run, for list titles and search. Fractions read as "3/4". */
export function inlineText(inlines: readonly Inline[]): string {
  return inlines
    .map((i) => (i.t === "text" ? i.v : i.t === "blank" ? "____" : `${i.whole !== undefined ? `${i.whole} ` : ""}${i.n}/${i.d}`))
    .join("");
}

/** First readable line of a question stem, shortened, for admin lists. */
export function stemSummary(content: QuestionDraft["content"], maxLength = 110): string {
  const firstParagraph = content.stem.find((b) => b.t === "p");
  const text = firstParagraph && firstParagraph.t === "p" ? inlineText(firstParagraph.c) : "(diagram question)";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
