/**
 * The next-action policy for a parent's Home (ADR-0008, UX-03).
 *
 * Pure and deterministic: the same state always yields the same single action. Add rules here,
 * in order, never in UI components. Every branch returns exactly one action, so Home always has
 * exactly one dominant thing to do.
 */

import { daysBetween } from "@/domain/assessments/dates";
import {
  ENOUGH_PRACTICE_SESSIONS_SINCE_MOCK,
  FINAL_MOCK_WINDOW_DAYS,
  PRACTICE_SESSION_MINUTES,
  dailyPracticeComplete,
  weakestWeakOutcome,
  type PracticeOutcome,
} from "./practice-focus";

/** A calendar day, "YYYY-MM-DD". Compares correctly as text. */
export type IsoDate = string;

export type ParentActionChild = { id: string; nickname: string };

export type ParentActionPaper = { id: string; number: number; status: "ready" };

export type ParentActionAssessment = {
  id: string;
  childId: string;
  name: string;
  /** "Mathematics". When present, a ready mock reads "Mathematics WA2 · Mock 1 is ready". */
  subject?: string;
  date: IsoDate;
  scopeConfirmed: boolean;
  papers: ParentActionPaper[];
  /**
   * Whether a final mock has been done for this assessment. Leave it out when unknown: the
   * "final mock" step only applies when this is explicitly `false`.
   */
  finalMockDone?: boolean;
};

type AttemptBase = {
  id: string;
  childId: string;
  /** ISO 8601. Newest first breaks ties between attempts that need the same action. */
  startedAt: string;
  /** The frozen paper this attempt is for. Used to tell whether the latest mock has been attempted. */
  paperId?: string;
  /** Parent-friendly name, e.g. "Maths WA3 · Mock 2". */
  label?: string;
};

/** One attempt at a mock, in the state the parent needs to know about. */
export type ParentActionAttempt =
  /** Given to the child on the iPad; they have not pressed Start yet. `startedAt` is when it was given. */
  | (AttemptBase & { status: "assigned" })
  | (AttemptBase & { status: "in_progress" })
  /** Handed in; marking has not finished. */
  | (AttemptBase & { status: "submitted" })
  /** Marked, but some answers need a quick check by the parent. */
  | (AttemptBase & { status: "needs_review"; reviewCount?: number })
  /** Marked and ready to look at. */
  | (AttemptBase & { status: "marked"; resultId: string; resultSeen: boolean; unreviewedMistakes: number });

/** Practice summary for the current child. Everything optional: absent means "not known". */
export type ParentActionPractice = {
  outcomes?: PracticeOutcome[];
  /** Practice sessions finished since the last mock was attempted. */
  sessionsSinceLastMock?: number;
  /** Practice minutes done today. */
  minutesToday?: number;
};

export type ParentActionState = {
  children: ParentActionChild[];
  selectedChildId?: string | undefined;
  /** In the order they were created; used to break ties between assessments on the same day. */
  assessments: ParentActionAssessment[];
  today: IsoDate;
  /** Mock attempts, for every child. Leave out when not loaded: Home then only guides preparation. */
  attempts?: ParentActionAttempt[];
  practice?: ParentActionPractice;
};

export type ParentActionKind =
  | "add_child"
  | "continue_mock"
  | "review_marking"
  | "marking_in_progress"
  | "review_result"
  | "review_mistakes"
  | "add_assessment"
  | "confirm_scope"
  | "generate_mock"
  | "start_mock"
  | "final_mock"
  | "generate_next_mock"
  | "start_practice"
  | "done_today";

/**
 * The order the policy checks, first match wins (UX_PRINCIPLES section 4). Attempt states come
 * first because a child's work in flight matters more than planning. After the mocks are done,
 * an assessment that is close comes before generic practice, and "enough practice" before more
 * practice, so the loop always moves on to the next mock.
 */
export const PARENT_ACTION_ORDER: readonly ParentActionKind[] = [
  "add_child",
  "continue_mock",
  "review_marking",
  "marking_in_progress",
  "review_result",
  "review_mistakes",
  "add_assessment",
  "confirm_scope",
  "generate_mock",
  "start_mock",
  "final_mock",
  "generate_next_mock",
  "start_practice",
  "done_today",
];

export type ParentAction = {
  kind: ParentActionKind;
  title: string;
  supportingText?: string;
  ctaLabel: string;
  href: string;
};

/** The child the actions are about: the selected one, else the first. */
export function currentChild(state: ParentActionState): ParentActionChild | undefined {
  return state.children.find((candidate) => candidate.id === state.selectedChildId) ?? state.children[0];
}

/** The current child's soonest assessment dated today or later. Ties keep creation order. */
export function nearestUpcomingAssessment(state: ParentActionState): ParentActionAssessment | undefined {
  const child = currentChild(state);
  if (!child) return undefined;
  const upcoming = state.assessments.filter(
    (assessment) => assessment.childId === child.id && assessment.date >= state.today,
  );
  // Earliest date first; the sort is stable, so equal dates keep their creation order.
  return [...upcoming].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
}

function newestFirst<T extends { startedAt: string }>(items: T[]): T[] {
  // Stable: attempts that started at the same moment keep the order they were given in.
  return [...items].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** The action for the child's mock attempts, or undefined when no attempt needs anything. */
function attemptAction(state: ParentActionState, child: ParentActionChild): ParentAction | undefined {
  const attempts = newestFirst((state.attempts ?? []).filter((attempt) => attempt.childId === child.id));
  const named = (attempt: ParentActionAttempt) => attempt.label ?? "mock";

  const inProgress = attempts.find((a) => a.status === "in_progress");
  if (inProgress) {
    return {
      kind: "continue_mock",
      title: `${child.nickname}'s ${named(inProgress)} is in progress`,
      supportingText: "Pick up where they left off.",
      ctaLabel: "Continue mock",
      href: `/mock/${inProgress.id}`,
    };
  }

  const needsReview = attempts.find((a) => a.status === "needs_review");
  if (needsReview && needsReview.status === "needs_review") {
    const count = needsReview.reviewCount;
    return {
      kind: "review_marking",
      title: count && count > 0 ? `${plural(count, "answer needs", "answers need")} a quick check` : "A few answers need a quick check",
      supportingText: `We weren't sure how to mark some of ${child.nickname}'s answers, and it takes about a minute to check.`,
      ctaLabel: "Check answers",
      href: `/progress/review/${needsReview.id}`,
    };
  }

  const waiting = attempts.find((a) => a.status === "assigned");
  if (waiting) {
    return {
      kind: "start_mock",
      title: `${named(waiting)} is waiting on ${child.nickname}'s Today screen`,
      supportingText: "Hand the iPad over when they are ready to start.",
      ctaLabel: "Hand over the iPad",
      href: `/mock/${waiting.id}`,
    };
  }

  const submitted = attempts.find((a) => a.status === "submitted");
  if (submitted) {
    return {
      kind: "marking_in_progress",
      title: `We're marking ${child.nickname}'s ${named(submitted)}`,
      supportingText: "The results will be here in a moment.",
      ctaLabel: "See marking progress",
      href: `/progress/results/${submitted.id}`,
    };
  }

  const marked = attempts.flatMap((a) => (a.status === "marked" ? [a] : []));
  const unseen = marked.find((a) => !a.resultSeen);
  if (unseen) {
    return {
      kind: "review_result",
      title: `${child.nickname}'s ${named(unseen)} is marked`,
      supportingText: "See what went well and what needs work.",
      ctaLabel: "See what needs work",
      href: `/progress/results/${unseen.resultId}`,
    };
  }

  const withMistakes = marked.find((a) => a.unreviewedMistakes > 0);
  if (withMistakes) {
    return {
      kind: "review_mistakes",
      title: `Go through ${plural(withMistakes.unreviewedMistakes, "mistake", "mistakes")} from ${named(withMistakes)}`,
      supportingText: "Fixing mistakes is the quickest way to improve.",
      ctaLabel: "Review mistakes",
      href: `/progress/results/${withMistakes.resultId}#mistakes`,
    };
  }
  return undefined;
}

/** What comes after the latest mock has been attempted and looked at. */
function afterMockAction(
  state: ParentActionState,
  child: ParentActionChild,
  assessment: ParentActionAssessment,
): ParentAction {
  const daysAway = daysBetween(state.today, assessment.date);
  if (assessment.finalMockDone === false && daysAway <= FINAL_MOCK_WINDOW_DAYS) {
    const when = daysAway <= 0 ? "today" : daysAway === 1 ? "tomorrow" : `in ${daysAway} days`;
    return {
      kind: "final_mock",
      title: `${assessment.name} is ${when}`,
      supportingText: "One last full mock helps build confidence.",
      ctaLabel: "Do final mock",
      href: `/prepare/${assessment.id}`,
    };
  }

  const practice = state.practice;
  if ((practice?.sessionsSinceLastMock ?? 0) >= ENOUGH_PRACTICE_SESSIONS_SINCE_MOCK) {
    return {
      kind: "generate_next_mock",
      title: `Time for the next ${assessment.name} mock`,
      supportingText: `${child.nickname} has practised since the last mock, so let's see how it went.`,
      ctaLabel: "Generate next mock",
      href: `/prepare/${assessment.id}`,
    };
  }

  const weak = practice?.outcomes ? weakestWeakOutcome(practice.outcomes) : undefined;
  if (weak && !dailyPracticeComplete(practice?.minutesToday)) {
    return {
      kind: "start_practice",
      title: `${weak.name} needs attention`,
      supportingText: `A ${PRACTICE_SESSION_MINUTES}-minute practice set will help.`,
      ctaLabel: `Start ${PRACTICE_SESSION_MINUTES}-minute ${weak.name} practice`,
      href: "/progress/practice",
    };
  }

  return {
    kind: "done_today",
    title: `${child.nickname} is done for today`,
    supportingText: "Nice work. Come back tomorrow for the next step.",
    ctaLabel: "See progress",
    href: "/progress",
  };
}

export function nextParentAction(state: ParentActionState): ParentAction {
  const child = currentChild(state);

  if (!child) {
    return {
      kind: "add_child",
      title: "Who are you preparing?",
      supportingText: "PaperKaki makes practice papers for your child's next school assessment.",
      ctaLabel: "Add your child",
      href: "/prepare/new",
    };
  }

  const inFlight = attemptAction(state, child);
  if (inFlight) return inFlight;

  const nearest = nearestUpcomingAssessment(state);

  if (!nearest) {
    return {
      kind: "add_assessment",
      title: `What is ${child.nickname} preparing for?`,
      supportingText: "Tell us the assessment and date. We'll build a mock paper around it.",
      ctaLabel: "Add upcoming assessment",
      href: "/prepare/new",
    };
  }

  if (!nearest.scopeConfirmed) {
    return {
      kind: "confirm_scope",
      title: `${nearest.name}: choose the topics`,
      supportingText: "Tick the topics from the school's notice.",
      ctaLabel: "Choose topics",
      href: `/prepare/${nearest.id}/scope`,
    };
  }

  const latestPaper = nearest.papers.reduce<ParentActionPaper | undefined>(
    (best, paper) => (!best || paper.number > best.number ? paper : best),
    undefined,
  );

  if (!latestPaper) {
    return {
      kind: "generate_mock",
      title: `${nearest.name}: topics confirmed`,
      supportingText: "We'll create a mock paper from the topics you chose.",
      ctaLabel: "Generate first mock",
      href: `/prepare/${nearest.id}`,
    };
  }

  // Attempts unknown, or the newest mock not attempted yet: the next step is to print it.
  const attempted =
    state.attempts !== undefined &&
    state.attempts.some((attempt) => attempt.childId === child.id && attempt.paperId === latestPaper.id);
  if (!attempted) {
    return {
      kind: "start_mock",
      title: `${nearest.subject ? `${nearest.subject} ` : ""}${nearest.name} · Mock ${latestPaper.number} is ready`,
      supportingText: "Print it on A4. The answer pack is separate.",
      ctaLabel: "Print mock",
      href: `/prepare/${nearest.id}/mocks/${latestPaper.id}`,
    };
  }

  return afterMockAction(state, child, nearest);
}
