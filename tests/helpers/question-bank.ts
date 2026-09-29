import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Candidate } from "@/domain/papers";
import type { Difficulty, QuestionType } from "@/schemas/question-content";

const root = path.resolve(import.meta.dirname, "../../content");

type RawQuestion = {
  familyCode: string;
  primaryOutcomeCode: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  marks: number;
};

type RawCurriculum = {
  domains: { topics: { code: string; parentLabel: string; sortOrder: number; outcomes: { code: string }[] }[] }[];
};

export type BankTopic = { topicId: string; label: string; outcomeIds: string[] };

const curriculum = JSON.parse(
  readFileSync(path.join(root, "curriculum/p3-maths-moe-2025-10.json"), "utf8"),
) as RawCurriculum;

/** All eleven Primary 3 topics, in curriculum order. */
export const BANK_TOPICS: BankTopic[] = curriculum.domains.flatMap((d) =>
  d.topics.map((t) => ({ topicId: t.code, label: t.parentLabel, outcomeIds: t.outcomes.map((o) => o.code) })),
);

const topicByOutcome = new Map(BANK_TOPICS.flatMap((t) => t.outcomeIds.map((o) => [o, t.topicId] as const)));

const files = readdirSync(path.join(root, "questions"))
  .filter((f) => f.endsWith(".json"))
  .sort();

/** The real question bank as selector candidates with synthetic stable ids q-<index>. */
export const BANK_CANDIDATES: Candidate[] = files
  .flatMap((f) => JSON.parse(readFileSync(path.join(root, "questions", f), "utf8")) as RawQuestion[])
  .map((q, i) => {
    const topicId = topicByOutcome.get(q.primaryOutcomeCode);
    if (!topicId) throw new Error(`Unknown outcome ${q.primaryOutcomeCode}`);
    return {
      questionId: `q-${i}`,
      familyId: q.familyCode,
      topicId,
      primaryOutcomeId: q.primaryOutcomeCode,
      questionType: q.questionType,
      difficulty: q.difficulty,
      marks: q.marks,
    };
  });

export function topicsByShortCode(shortCodes: string[]): BankTopic[] {
  return shortCodes.map((sc) => {
    const t = BANK_TOPICS.find((x) => x.topicId.endsWith(`-${sc}`));
    if (!t) throw new Error(`No topic ${sc}`);
    return t;
  });
}

/** Number of questions in content/questions, so tests follow the bank as it grows. */
export const BANK_SIZE = BANK_CANDIDATES.length;
