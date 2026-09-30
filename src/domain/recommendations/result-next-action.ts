import { topicsNeedingAttention, type TopicRow } from "@/domain/marking/result-summary";
import { nextParentAction, type ParentAction, type ParentActionState } from "./next-parent-action";
import type { PracticeOutcome } from "./practice-focus";

/**
 * Turns a mock's topic table into the practice list the recommendation policy works from: topics that
 * need attention are the weak areas (the emptiest first), strong topics are mastered. Deterministic,
 * and it never invents a curriculum outcome: a topic is only ever named as the parent already reads it.
 */
export function practiceOutcomesFromTopics(rows: readonly TopicRow[], markedAt: string): PracticeOutcome[] {
  // The recommendation must name the same topic the results page lists first under "What needs
  // attention" (most marks lost first), so that topic alone is the most urgent weak area.
  const firstAttention = topicsNeedingAttention(rows)[0]?.topicId;
  return rows.map((row) => {
    const ratio = row.maxMarks === 0 ? 1 : row.marks / row.maxMarks;
    const state =
      row.topicId === firstAttention
        ? "learning"
        : row.status === "needs_attention"
          ? "developing"
          : row.status === "strong"
            ? "mastered"
            : "almost_mastered";
    return { outcomeId: row.topicId, name: row.label, state, recentAccuracy: ratio, lastPracticedAt: markedAt };
  });
}

/**
 * The one recommended next action shown on the results page. It is the ordinary next-action policy
 * with this mock treated as looked at, except that "done for today" (which points back to Progress,
 * where the parent already is) becomes the next mock.
 */
export function resultNextAction(state: ParentActionState, assessmentId: string): ParentAction {
  const action = nextParentAction(state);
  if (action.kind !== "done_today") return action;
  return {
    kind: "generate_next_mock",
    title: "Ready for the next mock?",
    supportingText: "A fresh paper shows what has improved.",
    ctaLabel: "Get the next mock",
    href: `/prepare/${assessmentId}`,
  };
}
