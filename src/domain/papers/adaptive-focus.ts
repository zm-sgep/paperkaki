/**
 * The adaptive next mock (M10): where a later mock puts a little more weight. Pure and deterministic.
 *
 * The school's format stays exact and every confirmed topic stays on the paper; those are hard rules the
 * selector already enforces. What moves is only how the marks are *shared* between the topics, and which
 * questions inside a topic are preferred:
 *
 *  - a topic where the child is still learning or getting there gets a bigger share of the marks;
 *  - a topic that is secure gets a slightly smaller one, but never fewer than a small floor;
 *  - a topic with a secure skill whose spaced review is due gets a small lift (retention), and that skill's
 *    questions are preferred so it is revisited;
 *  - within a topic, the weak skills' questions are preferred.
 *
 * With no evidence at all every weight is equal, so the paper is the same as the balanced one.
 */
import type { BlueprintScopeItem } from "@/domain/assessments/blueprint";
import type { MasteryState } from "@/domain/mastery";

/** How much of the marks a topic in this state asks for, next to 1 for a topic that has not been started. */
export const TOPIC_WEIGHT: Record<MasteryState, number> = {
  not_started: 1,
  learning: 1.8,
  developing: 1.3,
  almost_mastered: 1.1,
  mastered: 0.75,
  retained: 0.7,
};

/** A topic with a skill due for review is asked for this much more. */
export const RETENTION_LIFT = 1.15;
/** A topic never gets fewer than this share of an even split, so it always has real marks on the paper. */
export const MIN_SHARE_OF_EVEN = 0.5;
/** Question preference inside the selector: a weak skill and a skill due for review. */
export const OUTCOME_BOOST = { weak: 2, due: 1.6 } as const;
/** A topic is "focused on" when it gets at least this much more than an even share. */
export const FOCUS_RATIO = 1.15;
export const MAX_FOCUS_TOPICS = 2;

export type FocusOutcome = {
  outcomeId: string;
  topicId: string;
  /** The state attention goes by (`attentionStateOf`): a skill doing well is not weak for having few answers. */
  state: MasteryState;
  /** ISO 8601. */
  reviewDueAt?: string;
};

export type AdaptiveFocus = {
  /** Marks each topic should carry, adding up to the paper's total. */
  targets: Record<string, number>;
  /** Preference for a skill's questions inside the selector (1 = none). */
  outcomeBoost: Record<string, number>;
  /** Secure skills whose review is due: the selector tries to include at least one question from each. */
  dueOutcomeIds: string[];
  /** The topics given a little more, most first. At most two. Empty when nothing stands out. */
  focusTopicIds: string[];
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Splits `total` by weight into whole numbers that add up to it (largest remainder, ties by topic id). */
export function shareByWeight(total: number, weights: readonly { id: string; weight: number }[]): Record<string, number> {
  const sum = weights.reduce((acc, item) => acc + item.weight, 0);
  const raw = weights.map((item) => ({ id: item.id, exact: sum > 0 ? (total * item.weight) / sum : total / weights.length }));
  const shares = raw.map((item) => ({ id: item.id, whole: Math.floor(item.exact), rest: item.exact - Math.floor(item.exact) }));
  let left = total - shares.reduce((acc, item) => acc + item.whole, 0);
  for (const item of [...shares].sort((a, b) => b.rest - a.rest || compareText(a.id, b.id))) {
    if (left <= 0) break;
    item.whole += 1;
    left -= 1;
  }
  return Object.fromEntries(shares.map((item) => [item.id, item.whole]));
}

/** Where a later mock puts its weight, from the state of the child's skills in the topics of the scope. */
export function adaptiveFocus(input: {
  scope: readonly Pick<BlueprintScopeItem, "topicId" | "outcomeIds">[];
  totalMarks: number;
  /** Each topic's state as attention sees it. A topic missing here counts as not started. */
  topics: readonly { topicId: string; state: MasteryState }[];
  outcomes: readonly FocusOutcome[];
  /** ISO 8601. */
  now: string;
}): AdaptiveFocus {
  const stateOf = new Map(input.outcomes.map((outcome) => [outcome.outcomeId, outcome]));
  const topicState = new Map(input.topics.map((topic) => [topic.topicId, topic.state]));
  const isDue = (outcome: FocusOutcome) =>
    (outcome.state === "mastered" || outcome.state === "retained") &&
    outcome.reviewDueAt !== undefined &&
    Date.parse(outcome.reviewDueAt) <= Date.parse(input.now);

  const outcomeBoost: Record<string, number> = {};
  const dueOutcomeIds: string[] = [];
  const weights = input.scope.map((item) => {
    const own = item.outcomeIds.map((id) => stateOf.get(id) ?? { outcomeId: id, topicId: item.topicId, state: "not_started" as MasteryState });
    for (const outcome of own) {
      if (outcome.state === "learning" || outcome.state === "developing") outcomeBoost[outcome.outcomeId] = OUTCOME_BOOST.weak;
      else if (isDue(outcome)) {
        outcomeBoost[outcome.outcomeId] = OUTCOME_BOOST.due;
        dueOutcomeIds.push(outcome.outcomeId);
      }
    }
    const state = topicState.get(item.topicId) ?? "not_started";
    return { id: item.topicId, weight: TOPIC_WEIGHT[state] * (own.some(isDue) ? RETENTION_LIFT : 1) };
  });

  const count = input.scope.length;
  const even = count === 0 ? 0 : input.totalMarks / count;
  // Shares by weight, then lift any topic below its floor and take the difference from the others evenly.
  let targets = shareByWeight(input.totalMarks, weights);
  const floor = Math.max(1, Math.floor(even * MIN_SHARE_OF_EVEN));
  const low = Object.keys(targets).filter((id) => (targets[id] as number) < floor);
  if (low.length > 0 && count > low.length) {
    const fixed = Object.fromEntries(low.map((id) => [id, floor]));
    const rest = weights.filter((item) => !low.includes(item.id));
    const remaining = input.totalMarks - floor * low.length;
    targets = { ...fixed, ...shareByWeight(remaining, rest) };
  }

  const focusTopicIds = weights
    .filter((item) => even > 0 && (targets[item.id] as number) >= even * FOCUS_RATIO && item.weight > 1)
    .sort((a, b) => (targets[b.id] as number) - (targets[a.id] as number) || b.weight - a.weight || compareText(a.id, b.id))
    .slice(0, MAX_FOCUS_TOPICS)
    .map((item) => item.id);
  return { targets, outcomeBoost, dueOutcomeIds: [...new Set(dueOutcomeIds)].sort(compareText), focusTopicIds };
}

/** The scope with each topic's target marks moved to the adaptive share. Everything else is unchanged. */
export function applyFocus<T extends Pick<BlueprintScopeItem, "topicId" | "targetMarks">>(scope: readonly T[], focus: AdaptiveFocus): T[] {
  return scope.map((item) => ({ ...item, targetMarks: focus.targets[item.topicId] ?? item.targetMarks }));
}
