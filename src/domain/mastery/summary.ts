import { MASTERY_POLICY_V1 as P } from "./policy";
import { MASTERY_STATE_RANK, type MasteryState } from "./types";

export type TopicOutcomeState = {
  outcomeId: string;
  state: MasteryState;
  /** State at the start of the period being reported (e.g. before the latest mock). */
  previousState?: MasteryState;
  /** When known, a "learning" outcome with too little evidence is "just getting started", not a concern. */
  evidenceCount?: number;
};

export type TopicStatus = "not_started" | "needs_attention" | "improved" | "improved_with_gaps" | "on_track" | "strong";

export type TopicSummary = {
  topicName: string;
  status: TopicStatus;
  improved: boolean;
  needsAttention: boolean;
  /** Parent-facing sentence parts, e.g. ["Fractions improved"]. No numbers. */
  parts: string[];
  /** Parts joined for a single line: "Fractions improved · some Fractions skills still need attention". */
  headline: string;
};

const rank = (state: MasteryState) => MASTERY_STATE_RANK[state];

function outcomeImproved(o: TopicOutcomeState): boolean {
  return o.previousState !== undefined && rank(o.state) > rank(o.previousState) && rank(o.state) >= rank("developing");
}

function outcomeDropped(o: TopicOutcomeState): boolean {
  return o.previousState !== undefined && rank(o.state) < rank(o.previousState);
}

function outcomeNeedsAttention(o: TopicOutcomeState): boolean {
  if (outcomeDropped(o)) return true;
  if (o.state === "developing") return true;
  if (o.state === "learning") return o.evidenceCount === undefined || o.evidenceCount >= P.minItemsForBands;
  return false;
}

/** Turn a topic's outcome states into the parent's "improved" / "needs attention" wording. */
export function summariseTopic(topicName: string, outcomes: readonly TopicOutcomeState[]): TopicSummary {
  const improved = outcomes.some(outcomeImproved);
  const needsAttention = outcomes.some(outcomeNeedsAttention);

  let status: TopicStatus;
  let parts: string[];
  if (outcomes.every((o) => o.state === "not_started")) {
    status = "not_started";
    parts = [`${topicName} not started yet`];
  } else if (improved && needsAttention) {
    status = "improved_with_gaps";
    parts = [`${topicName} improved`, `some ${topicName} skills still need attention`];
  } else if (needsAttention) {
    status = "needs_attention";
    parts = [`${topicName} still needs attention`];
  } else if (improved) {
    status = "improved";
    parts = [`${topicName} improved`];
  } else if (outcomes.every((o) => o.state === "mastered" || o.state === "retained")) {
    status = "strong";
    parts = [`${topicName} is going really well`];
  } else {
    status = "on_track";
    parts = [`${topicName} is coming along`];
  }
  return { topicName, status, improved, needsAttention, parts, headline: parts.join(" · ") };
}
