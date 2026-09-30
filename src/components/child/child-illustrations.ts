import type { ChildActionKind } from "@/domain/recommendations/next-child-action";

/** Which spot illustration goes with each mission on the child's Today. Decoration only: the words carry the meaning. */
export type ChildIllustrationName = "sunrise" | "ready-paper" | "paper-stack" | "sprout" | "check-burst";

export const CHILD_ILLUSTRATION: Record<ChildActionKind, ChildIllustrationName> = {
  // A mock to sit: a clean paper and a pencil.
  resume_mock: "ready-paper",
  start_mock: "ready-paper",
  // A mark to look at.
  see_results: "paper-stack",
  // Learning: growth.
  fix_mistakes: "sprout",
  // The day's practice: the sun coming up.
  resume_practice: "sunrise",
  start_practice: "sunrise",
  // Nothing more today.
  done_today: "check-burst",
};
