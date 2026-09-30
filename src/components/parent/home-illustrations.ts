import type { ParentActionKind } from "@/domain/recommendations/next-parent-action";

/** Which spot illustration goes with each next action on the parent's Home. Decoration only: the words carry the meaning. */
export type HomeIllustrationName = "paper-stack" | "ready-paper" | "sprout" | "check-burst" | "gift-box";

export const HOME_ILLUSTRATION: Record<ParentActionKind, HomeIllustrationName> = {
  // Getting set up: papers and scope.
  add_child: "paper-stack",
  add_assessment: "paper-stack",
  confirm_scope: "paper-stack",
  // A mock is being made, sat or marked.
  generate_mock: "ready-paper",
  start_mock: "ready-paper",
  continue_mock: "ready-paper",
  marking_in_progress: "ready-paper",
  review_marking: "ready-paper",
  final_mock: "ready-paper",
  // Learning from results: growth.
  review_result: "sprout",
  review_mistakes: "sprout",
  generate_next_mock: "sprout",
  start_practice: "sprout",
  // Nothing more today.
  done_today: "check-burst",
};
