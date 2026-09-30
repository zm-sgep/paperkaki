import { startOfSingaporeDay } from "@/domain/assessments/dates";
import type { PracticeOutcome } from "@/domain/recommendations";
import type { Database } from "@/repositories/postgres/client";
import { listMarkedAttemptHeaders } from "@/repositories/postgres/attempts";
import { getOpenPracticeSession, getPendingSuggestion, listPracticeSessionsCompletedSince } from "@/repositories/postgres/practice";
import { getLearningMap, startedTopics } from "./learning-map";

/**
 * What the two Home screens need to know about one child's practice: which topics are worth practising,
 * how much has been done today and since the last mock, a set left unfinished, and a suggestion that is
 * still waiting. Only topics the child has worked on are offered: practice is a reaction to evidence.
 */

export type PracticeSummary = {
  outcomes: PracticeOutcome[];
  minutesToday: number;
  setsToday: number;
  sessionsSinceLastMock: number;
  unfinished?: { sessionId: string; focusName: string };
  /** A topic the parent suggested that the child has not started. `outcomeId` is the topic's id. */
  suggested?: { outcomeId: string; name: string };
};

export async function getPracticeSummary(childId: string, context: { db: Database; now: Date }): Promise<PracticeSummary> {
  const { db, now } = context;
  const [map, open, suggestion, todaySessions, marked] = await Promise.all([
    getLearningMap(childId, { db, now }),
    getOpenPracticeSession(db, childId),
    getPendingSuggestion(db, childId),
    listPracticeSessionsCompletedSince(db, childId, startOfSingaporeDay(now)),
    listMarkedAttemptHeaders(db, childId),
  ]);
  const lastMarkedAt = marked.reduce<Date | null>((latest, header) => {
    const at = header.attempt.markedAt;
    return at && (!latest || at > latest) ? at : latest;
  }, null);
  const sinceMock = lastMarkedAt ? await listPracticeSessionsCompletedSince(db, childId, lastMarkedAt) : [];
  const topics = map?.topics ?? [];
  const suggestedTopic = suggestion ? topics.find((topic) => topic.topicId === suggestion.topicId) : undefined;
  return {
    outcomes: map ? startedTopics(map).map((topic) => topic.practice) : [],
    minutesToday: todaySessions.reduce((sum, session) => sum + (session.minutes ?? 0), 0),
    setsToday: todaySessions.length,
    sessionsSinceLastMock: sinceMock.length,
    ...(open ? { unfinished: { sessionId: open.id, focusName: open.focusLabel } } : {}),
    ...(suggestedTopic ? { suggested: { outcomeId: suggestedTopic.topicId, name: suggestedTopic.label } } : {}),
  };
}
