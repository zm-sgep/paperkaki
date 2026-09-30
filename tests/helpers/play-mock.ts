import { assignMockToChild, saveAttemptProgress, startAttempt, submitAttempt } from "@/application/commands/attempts";
import { generateMock } from "@/application/commands/papers";
import type { CurrentChild } from "@/application/queries/current-child";
import type { Database } from "@/repositories/postgres/client";
import { listAttemptPaperQuestions, type AttemptPaperQuestion } from "@/repositories/postgres/attempts";
import { AnswerSchema } from "@/schemas/question-content";
import type { StorageService } from "@/services/storage";
import { NOW } from "./assessment-fixtures";
import { silentLogger } from "./silent-logger";

/** A request key for the nth mock a test makes. */
export const requestKey = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export type PlayedAnswer = "right" | "wrong" | "blank";

/**
 * Makes the next mock of an assessment and plays it for the child: each question is answered right, wrong
 * or left blank as `plan` says. Nothing has handwriting, so every answer is marked by rule at once and the
 * mock is marked as soon as it is handed in. Returns the paper's questions with how each was answered.
 */
export async function playMock(input: {
  db: Database;
  storage: StorageService;
  parentProfileId: string;
  child: CurrentChild;
  assessmentId: string;
  key: number;
  /** Seconds after NOW that the mock is handed in. Later mocks should pass later times. */
  handedInAt?: number;
  plan: (item: AttemptPaperQuestion) => PlayedAnswer;
}): Promise<{ paperId: string; attemptId: string; items: (AttemptPaperQuestion & { played: PlayedAnswer })[] }> {
  const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
  const base = input.handedInAt ?? 600;
  const ctx = (now: Date) => ({ db: input.db, now, storage: input.storage, logger: silentLogger });
  const { paperId } = await generateMock(input.parentProfileId, input.assessmentId, requestKey(input.key), ctx(at(base - 500)));
  const { attemptId } = await assignMockToChild(input.parentProfileId, paperId, ctx(at(base - 400)));
  await startAttempt(input.child, attemptId, ctx(at(base - 300)));
  const items = await listAttemptPaperQuestions(input.db, paperId);
  const played = items.map((item) => ({ ...item, played: input.plan(item) }));
  const responses = played.map((item) => {
    const answer = AnswerSchema.parse(item.question.answer);
    const base = { paperQuestionId: item.paperQuestionId, selected: null, typed: null, strokes: null, flagged: false };
    if (item.played === "blank") return base;
    const right = item.played === "right";
    switch (answer.kind) {
      case "mcq":
        return { ...base, selected: right ? answer.correct : (["A", "B", "C", "D"] as const).find((option) => option !== answer.correct)! };
      case "number":
        return { ...base, typed: right ? answer.value : "0.01" };
      case "fraction":
        return { ...base, typed: right ? answer.value : "1/99" };
      case "text":
        return right ? { ...base, typed: answer.accepted[0]! } : base;
    }
  });
  await saveAttemptProgress(input.child, attemptId, { position: 1, savedAt: at(base - 200).toISOString(), responses }, ctx(at(base - 190)));
  await submitAttempt(input.child, attemptId, ctx(at(base)));
  return { paperId, attemptId, items: played };
}
