import { attemptLabel } from "@/domain/attempts";
import {
  MASTERY_STATE_HELP,
  MASTERY_STATE_WORDS,
  deriveMastery,
  evidenceWords,
  mistakePatterns,
  progressSentence,
  starsForState,
  type MasteryState,
  type MistakePatternKind,
  type ProgressTopic,
  type TopicOutcomeState,
} from "@/domain/mastery";
import { scoreText } from "@/domain/marking";
import { nearestUpcomingAssessment, nextParentAction, type ParentAction } from "@/domain/recommendations";
import type { Database } from "@/repositories/postgres/client";
import { listMarkedAttemptHeaders } from "@/repositories/postgres/attempts";
import { attemptTotals, finalScoreOf, listAttemptMarking, markingSummaries } from "@/repositories/postgres/marking";
import { listEvidenceForChild } from "@/repositories/postgres/mastery";
import { getPendingSuggestion } from "@/repositories/postgres/practice";
import { getReadyDb } from "@/repositories/postgres/ready";
import { evidenceRowToDomain } from "@/application/mastery";
import { getParentChildren } from "./children";
import type { CurrentChild } from "./current-child";
import { getLearningMap, type LearningMap, type MapTopic } from "./learning-map";
import { getParentHomeState } from "./parent-home";
import { listRecentResults, type RecentResult } from "./results";

/**
 * The two Progress screens (M8, UX_SPEC sections 5 and 8). The parent reads what changed, what needs
 * attention and one next action, with detail underneath; the child sees a simple map of stars. Everything
 * is read from the learning map and the marking history: no state or mark is worked out here.
 */

type Context = { db?: Database; now?: Date };

async function resolveDb(context: Context): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export type TopicProgressRow = {
  topicId: string;
  label: string;
  state: MasteryState;
  /** "Getting there". */
  word: string;
  help: string;
  stars: number;
  evidence: string;
  href: string;
};

export type TrendPoint = { label: string; scoreText: string; ratio: number };

export type ParentProgress =
  | { kind: "no_child" }
  | { kind: "empty"; childNickname: string }
  | {
      kind: "ready";
      childId: string;
      childNickname: string;
      sentence: string;
      action: ParentAction;
      topics: TopicProgressRow[];
      notStarted: { topicId: string; label: string }[];
      recentResults: RecentResult[];
      /** Marks of the child's mocks, oldest first. Empty until there are two. */
      trend: TrendPoint[];
      patterns: { kind: MistakePatternKind; label: string; count: number }[];
      detail: { topicId: string; label: string; outcomes: { label: string; word: string }[] }[];
    };

function rowOf(topic: MapTopic): TopicProgressRow {
  const sessions = Math.max(0, ...topic.testable.map((outcome) => outcome.mastery.sessions));
  return {
    topicId: topic.topicId,
    label: topic.label,
    state: topic.mastery.state,
    word: MASTERY_STATE_WORDS[topic.mastery.state],
    help: MASTERY_STATE_HELP[topic.mastery.state],
    stars: starsForState(topic.mastery.state),
    evidence: evidenceWords(topic.mastery.evidenceCount, sessions),
    href: `/progress/topics/${topic.topicId}`,
  };
}

/** Each skill's state before the latest work, so a topic can be called improved. Left out when there was nothing before. */
async function progressTopics(db: Database, childId: string, map: LearningMap, now: Date): Promise<ProgressTopic[]> {
  const evidence = (await listEvidenceForChild(db, childId)).map(evidenceRowToDomain);
  const latest = evidence.reduce<{ sessionId: string; at: string } | null>((best, entry) => (!best || entry.at > best.at ? { sessionId: entry.sessionId, at: entry.at } : best), null);
  const earlier = latest ? evidence.filter((entry) => entry.sessionId !== latest.sessionId) : [];
  const before = new Map(deriveMastery(earlier, now).map((outcome) => [outcome.outcomeId, outcome.state]));
  return map.topics.map((topic) => ({
    topicId: topic.topicId,
    label: topic.label,
    state: topic.mastery.state,
    ...(topic.mastery.recentAccuracy !== undefined ? { recentAccuracy: topic.mastery.recentAccuracy } : {}),
    outcomes: topic.testable.map((outcome): TopicOutcomeState => {
      const previous = before.get(outcome.outcomeId);
      return {
        outcomeId: outcome.outcomeId,
        state: outcome.mastery.state,
        evidenceCount: outcome.mastery.evidenceCount,
        ...(previous && previous !== "not_started" ? { previousState: previous } : {}),
      };
    }),
  }));
}

/** The kinds of slip in a child's newest marked mocks, from what marking saw and from questions left blank. */
async function slipKinds(db: Database, childId: string): Promise<MistakePatternKind[]> {
  const kinds: MistakePatternKind[] = [];
  for (const header of (await listMarkedAttemptHeaders(db, childId)).slice(0, 5)) {
    for (const question of await listAttemptMarking(db, header.attempt.id, header.paperId)) {
      const score = finalScoreOf(question);
      if (score === null || score >= question.marks) continue;
      const ai = [...question.history].reverse().find((decision) => decision.errorType);
      const answered = Boolean(question.response && (question.response.selectedOption || question.response.typedAnswer?.trim()));
      if (ai?.errorType) kinds.push(ai.errorType as MistakePatternKind);
      else if (!answered) kinds.push("blank");
    }
  }
  return kinds;
}

async function trendOf(db: Database, childId: string): Promise<TrendPoint[]> {
  const headers = (await listMarkedAttemptHeaders(db, childId)).slice(0, 6).reverse();
  const points: TrendPoint[] = [];
  for (const header of headers) {
    const totals = await attemptTotals(db, header.attempt.id, header.paperId);
    if (!totals || totals.maxScore === 0) continue;
    points.push({ label: attemptLabel(header.assessmentSubject, header.assessmentName, header.paperNumber), scoreText: scoreText(totals.score, totals.maxScore), ratio: totals.score / totals.maxScore });
  }
  return points.length >= 2 ? points : [];
}

/** The parent's Progress for the child in view. */
export async function getParentProgress(parentProfileId: string, context: Context = {}): Promise<ParentProgress> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  const { children, selectedChildId } = await getParentChildren(parentProfileId, { db });
  const child = children.find((candidate) => candidate.id === selectedChildId);
  if (!child) return { kind: "no_child" };
  const map = await getLearningMap(child.id, { db, now });
  const started = map?.topics.filter((topic) => topic.mastery.state !== "not_started") ?? [];
  if (!map || started.length === 0) return { kind: "empty", childNickname: child.nickname };

  const topics = await progressTopics(db, child.id, map, now);
  const { sentence } = progressSentence(topics);
  const state = await getParentHomeState(parentProfileId, { db, now });
  let action = nextParentAction(state);
  if (action.kind === "done_today") {
    const next = nearestUpcomingAssessment(state);
    action = next
      ? { kind: "generate_next_mock", title: "Ready for the next mock?", supportingText: "A fresh paper shows what has improved.", ctaLabel: "Get the next mock", href: `/prepare/${next.id}` }
      : { kind: "add_assessment", title: `What is ${child.nickname} preparing for next?`, ctaLabel: "Add upcoming assessment", href: "/prepare/new" };
  } else if (action.kind === "start_practice") {
    // The child does the practice: the parent's part is to suggest it.
    const topicId = new URL(action.href, "https://paperkaki.invalid").searchParams.get("topic");
    const topic = map.topics.find((candidate) => candidate.topicId === topicId);
    if (topic) action = { ...action, ctaLabel: `Suggest ${topic.label} practice to ${child.nickname}` };
  }

  const ordered = [...started].sort((a, b) => a.mastery.stars - b.mastery.stars || a.label.localeCompare(b.label));
  return {
    kind: "ready",
    childId: child.id,
    childNickname: child.nickname,
    sentence,
    action,
    topics: ordered.map(rowOf),
    notStarted: map.topics.filter((topic) => topic.mastery.state === "not_started").map((topic) => ({ topicId: topic.topicId, label: topic.label })),
    recentResults: await listRecentResults({ kind: "parent", parentProfileId }, 5, { db, now, childId: child.id }),
    trend: await trendOf(db, child.id),
    patterns: mistakePatterns(await slipKinds(db, child.id)),
    detail: started.map((topic) => ({
      topicId: topic.topicId,
      label: topic.label,
      outcomes: topic.testable.map((outcome) => ({ label: outcome.label, word: MASTERY_STATE_WORDS[outcome.mastery.state] })),
    })),
  };
}

export type ParentTopicProgress = {
  childId: string;
  childNickname: string;
  topicId: string;
  label: string;
  word: string;
  help: string;
  evidence: string;
  outcomes: { label: string; word: string; help: string; evidence: string }[];
  /** The one action: suggest practice on this topic. */
  suggest: { ctaLabel: string; href: string };
};

/** One topic for the child in view: its skills in plain words and one action. Null when it is not a topic we have. */
export async function getParentTopicProgress(parentProfileId: string, topicId: string, context: Context = {}): Promise<ParentTopicProgress | null> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  const { children, selectedChildId } = await getParentChildren(parentProfileId, { db });
  const child = children.find((candidate) => candidate.id === selectedChildId);
  if (!child) return null;
  const map = await getLearningMap(child.id, { db, now });
  const topic = map?.topics.find((candidate) => candidate.topicId === topicId);
  if (!topic) return null;
  const row = rowOf(topic);
  return {
    childId: child.id,
    childNickname: child.nickname,
    topicId,
    label: topic.label,
    word: row.word,
    help: row.help,
    evidence: row.evidence,
    outcomes: topic.testable.map((outcome) => ({
      label: outcome.label,
      word: MASTERY_STATE_WORDS[outcome.mastery.state],
      help: MASTERY_STATE_HELP[outcome.mastery.state],
      evidence: evidenceWords(outcome.mastery.evidenceCount, outcome.mastery.sessions),
    })),
    suggest: { ctaLabel: `Suggest ${topic.label} practice to ${child.nickname}`, href: `/progress/practice?topic=${encodeURIComponent(topicId)}` },
  };
}

export type ParentPracticeSuggestion = {
  childId: string;
  childNickname: string;
  topicId: string;
  topicLabel: string;
  /** Already suggested and waiting on the child's Today. */
  alreadySuggested: boolean;
} | null;

/** What the "Suggest to Darius" screen shows: the topic asked for, or the weakest one. Null when there is none. */
export async function getParentPracticeSuggestion(parentProfileId: string, topicParam: string | undefined, context: Context = {}): Promise<ParentPracticeSuggestion> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  const { children, selectedChildId } = await getParentChildren(parentProfileId, { db });
  const child = children.find((candidate) => candidate.id === selectedChildId);
  if (!child) return null;
  const map = await getLearningMap(child.id, { db, now });
  if (!map) return null;
  const started = map.topics.filter((topic) => topic.mastery.state !== "not_started");
  const topic =
    (topicParam ? map.topics.find((candidate) => candidate.topicId === topicParam) : undefined) ??
    (topicParam ? undefined : progressSentenceTopic(await progressTopics(db, child.id, map, now), map, started));
  if (!topic) return null;
  const pending = await getPendingSuggestion(db, child.id);
  return { childId: child.id, childNickname: child.nickname, topicId: topic.topicId, topicLabel: topic.label, alreadySuggested: pending?.topicId === topic.topicId };
}

function progressSentenceTopic(topics: ProgressTopic[], map: LearningMap, started: MapTopic[]): MapTopic | undefined {
  const attention = progressSentence(topics).attention;
  return (attention ? map.topics.find((topic) => topic.topicId === attention.topicId) : undefined) ?? started[0];
}

// ---------------------------------------------------------------------------
// The child's Progress
// ---------------------------------------------------------------------------

export type ChildProgress = {
  topics: { topicId: string; label: string; stars: number; word: string }[];
  recentResults: RecentResult[];
  /** The newest marked mock with mistakes not yet gone through, or null. */
  mistakes: { attemptId: string; label: string; count: number; href: string } | null;
};

export async function getChildProgress(child: CurrentChild, context: Context = {}): Promise<ChildProgress> {
  const db = await resolveDb(context);
  const now = context.now ?? new Date();
  const map = await getLearningMap(child.childId, { db, now });
  const marked = await listMarkedAttemptHeaders(db, child.childId);
  const summaries = await markingSummaries(db, marked.map((header) => header.attempt.id));
  const withMistakes = marked.find((header) => header.attempt.mistakesReviewedAt === null && (summaries.get(header.attempt.id)?.mistakes ?? 0) > 0);
  return {
    topics: (map?.topics ?? [])
      .filter((topic) => topic.mastery.state !== "not_started")
      .map((topic) => ({ topicId: topic.topicId, label: topic.label, stars: starsForState(topic.mastery.state), word: MASTERY_STATE_WORDS[topic.mastery.state] })),
    recentResults: await listRecentResults({ kind: "child", childId: child.childId }, 5, { db, now }),
    mistakes: withMistakes
      ? {
          attemptId: withMistakes.attempt.id,
          label: attemptLabel(withMistakes.assessmentSubject, withMistakes.assessmentName, withMistakes.paperNumber),
          count: summaries.get(withMistakes.attempt.id)?.mistakes ?? 0,
          href: `/results/${withMistakes.attempt.id}/mistakes`,
        }
      : null,
  };
}
