import { ensureEvidenceForChild } from "@/application/mastery";
import { topicMasteryOf, type OutcomeMastery, type TopicMastery } from "@/domain/mastery";
import { weakestDueOutcome, type PracticeCandidate, type PracticeOutcome } from "@/domain/recommendations";
import type { Database } from "@/repositories/postgres/client";
import { listMasteryProfiles } from "@/repositories/postgres/mastery";
import { listApprovedCandidates, type CandidateQuestion } from "@/repositories/postgres/questions";
import { getCurriculumTree, getCurriculumVersionForLevel } from "./curriculum";

/**
 * The learning map (M8, M9): the published P3 Mathematics topics and skills, which of them the question
 * bank can test, and where one child is with each. This is what practice, Today and both Progress pages
 * read; none of them works out a state itself. Only skills with approved questions count, so a topic can
 * reach "Secure" when everything that can be tested is.
 */

export const LEARNING_SUBJECT = "Mathematics";
export const LEARNING_LEVEL = "P3";

export type MapOutcome = {
  outcomeId: string;
  /** The skill in the child's words. */
  label: string;
  /** False when the bank has no approved question for it yet. */
  testable: boolean;
  mastery: OutcomeMastery;
};

export type MapTopic = {
  topicId: string;
  /** The topic as a parent (and a child) reads it: "Fractions". */
  label: string;
  outcomes: MapOutcome[];
  /** Only the skills the bank can test. */
  testable: MapOutcome[];
  mastery: TopicMastery;
  /** The topic as the practice policy sees it. Its `outcomeId` is the topic's id. */
  practice: PracticeOutcome;
};

export type LearningMap = {
  curriculumVersionId: string;
  topics: MapTopic[];
  /** Every approved question of the map's skills, for choosing practice. */
  candidates: CandidateQuestion[];
};

type Context = { db: Database; now: Date };

export function practiceCandidateOf(candidate: CandidateQuestion): PracticeCandidate {
  return {
    questionId: candidate.questionId,
    familyId: candidate.familyId,
    outcomeId: candidate.primaryOutcomeId,
    questionType: candidate.questionType,
    difficulty: candidate.difficulty,
    marks: candidate.marks,
    estimatedSeconds: candidate.estimatedSeconds,
  };
}

/** The map for one child. Null when no P3 Mathematics curriculum is published. */
export async function getLearningMap(childId: string, context: Context): Promise<LearningMap | null> {
  const { db, now } = context;
  const version = await getCurriculumVersionForLevel({ subject: LEARNING_SUBJECT, level: LEARNING_LEVEL, audience: "public" }, { db });
  if (!version) return null;
  const tree = await getCurriculumTree(version.id, { audience: "public", level: LEARNING_LEVEL }, { db });
  if (!tree) return null;

  await ensureEvidenceForChild(db, childId, now);
  const outcomeIds = tree.domains.flatMap((domain) => domain.topics.flatMap((topic) => topic.outcomes.map((outcome) => outcome.id)));
  const [candidates, profiles] = await Promise.all([
    listApprovedCandidates(db, { curriculumVersionId: version.id, outcomeIds, level: LEARNING_LEVEL, subject: LEARNING_SUBJECT }),
    listMasteryProfiles(db, childId),
  ]);
  const testableIds = new Set(candidates.map((candidate) => candidate.primaryOutcomeId));
  const profileOf = new Map(profiles.map((profile) => [profile.outcomeId, profile]));

  const topics: MapTopic[] = [];
  for (const domain of [...tree.domains].sort((a, b) => a.sortOrder - b.sortOrder)) {
    for (const topic of [...domain.topics].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const outcomes: MapOutcome[] = topic.outcomes.map((outcome) => {
        const profile = profileOf.get(outcome.id);
        const mastery: OutcomeMastery = profile
          ? {
              outcomeId: outcome.id,
              state: profile.state as OutcomeMastery["state"],
              evidenceCount: profile.evidenceCount,
              sessions: profile.sessions,
              ...(profile.lastPracticedAt ? { lastPracticedAt: profile.lastPracticedAt.toISOString() } : {}),
              ...(profile.masteredAt ? { masteredAt: profile.masteredAt.toISOString() } : {}),
              ...(profile.reviewDueAt ? { reviewDueAt: profile.reviewDueAt.toISOString() } : {}),
              ...(profile.recentAccuracy !== null ? { recentAccuracy: profile.recentAccuracy } : {}),
            }
          : { outcomeId: outcome.id, state: "not_started", evidenceCount: 0, sessions: 0 };
        return { outcomeId: outcome.id, label: outcome.childLabel, testable: testableIds.has(outcome.id), mastery };
      });
      const testable = outcomes.filter((outcome) => outcome.testable);
      if (testable.length === 0) continue;
      const mastery = topicMasteryOf(testable.map((outcome) => outcome.mastery));
      topics.push({
        topicId: topic.id,
        label: topic.parentLabel,
        outcomes,
        testable,
        mastery,
        practice: {
          outcomeId: topic.id,
          name: topic.parentLabel,
          state: mastery.state,
          ...(mastery.recentAccuracy !== undefined ? { recentAccuracy: mastery.recentAccuracy } : {}),
          ...(mastery.lastPracticedAt ? { lastPracticedAt: mastery.lastPracticedAt } : {}),
          ...(mastery.reviewDueAt ? { reviewDueAt: mastery.reviewDueAt } : {}),
        },
      });
    }
  }
  return { curriculumVersionId: version.id, topics, candidates };
}

/** Topics the child has actually worked on: they have evidence, so practice can say something true about them. */
export function startedTopics(map: LearningMap): MapTopic[] {
  return map.topics.filter((topic) => topic.mastery.state !== "not_started");
}

/** The topic Practice and Today recommend, by the same rule: a parent's suggestion, else the weakest one that is due. */
export function recommendedTopic(map: LearningMap, now: Date): MapTopic | undefined {
  const started = startedTopics(map);
  const weakest = weakestDueOutcome(started.map((topic) => topic.practice), now.toISOString());
  const found = weakest ? started.find((topic) => topic.topicId === weakest.outcomeId) : undefined;
  // A child with no work yet is offered the first topic, so Practice is never a blank page.
  return found ?? (started.length === 0 ? map.topics[0] : undefined);
}

