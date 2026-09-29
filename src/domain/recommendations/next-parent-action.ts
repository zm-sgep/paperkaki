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

export function nextParentAction(state: ParentActionState): ParentAction {
  const child =
    state.children.find((candidate) => candidate.id === state.selectedChildId) ?? state.children[0];

  if (!child) {
    return {
      kind: "add_child",
      title: "Who are you preparing?",
      ctaLabel: "Add your child",
      href: "/prepare/new",
    };
  }

  const upcoming = state.assessments.filter(
    (assessment) => assessment.childId === child.id && assessment.date >= state.today,
  );
  // Earliest date first; the sort is stable, so equal dates keep their creation order.
  const nearest = [...upcoming].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];

  if (!nearest) {
    return {
      kind: "add_assessment",
      title: `What is ${child.nickname} preparing for?`,
      ctaLabel: "Add upcoming assessment",
      href: "/prepare/new",
    };
  }

  if (!nearest.scopeConfirmed) {
    return {
      kind: "confirm_scope",
      title: `${nearest.name}: choose the topics`,
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
      ctaLabel: "Generate first mock",
      href: `/prepare/${nearest.id}`,
    };
  }

  return {
    kind: "start_mock",
    title: `${nearest.name} · Mock ${latestPaper.number} is ready`,
    ctaLabel: "Print mock",
    href: `/prepare/${nearest.id}/mocks/${latestPaper.id}`,
  };
}
