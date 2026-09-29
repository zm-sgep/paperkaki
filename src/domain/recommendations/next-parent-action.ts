/**
 * The next-action policy for a parent's Home (ADR-0008, UX-03).
 *
 * Pure and deterministic: the same state always yields the same single action. Add rules here,
 * in order, never in UI components. Every branch returns exactly one action, so Home always has
 * exactly one dominant thing to do.
 */

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
};

export type ParentActionState = {
  children: ParentActionChild[];
  selectedChildId?: string | undefined;
  /** In the order they were created; used to break ties between assessments on the same day. */
  assessments: ParentActionAssessment[];
  today: IsoDate;
};

export type ParentActionKind =
  | "add_child"
  | "add_assessment"
  | "confirm_scope"
  | "generate_mock"
  | "start_mock";

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

  return {
    kind: "start_mock",
    title: `${nearest.subject ? `${nearest.subject} ` : ""}${nearest.name} · Mock ${latestPaper.number} is ready`,
    supportingText: "Print it on A4. The answer pack is separate.",
    ctaLabel: "Print mock",
    href: `/prepare/${nearest.id}/mocks/${latestPaper.id}`,
  };
}
