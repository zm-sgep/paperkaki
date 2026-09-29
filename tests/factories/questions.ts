import type { Database } from "@/repositories/postgres/client";
import type { CurriculumOutcome, CurriculumTopic, CurriculumVersion, ParentProfile } from "@/repositories/postgres/schema";
import type { QuestionDraft } from "@/schemas/question-content";
import { insertParentProfile } from "./parent-profile";
import { insertTestOutcomeTree, insertTestSource, insertTestVersion } from "./curriculum";

/**
 * Fictional question-bank fixtures ("Fixture family", outcome codes O1, O2 from the curriculum
 * factory). A question bed is one curriculum version with two outcomes and an admin profile.
 */

export type QuestionBed = {
  admin: ParentProfile;
  parent: ParentProfile;
  version: CurriculumVersion;
  topic: CurriculumTopic;
  outcome: CurriculumOutcome;
  secondOutcome: CurriculumOutcome;
};

let bedCounter = 0;

export async function createQuestionBed(db: Database, key = `B${bedCounter + 1}`): Promise<QuestionBed> {
  bedCounter += 1;
  const n = String(bedCounter).padStart(4, "0");
  const admin = await insertParentProfile(db, "A", {
    id: `00000000-0000-4000-8a00-00000000${n}`,
    authSubject: `test-admin-${key}`,
    email: `admin-${key.toLowerCase()}@example.test`,
    displayName: `Test Admin ${key}`,
    role: "admin",
  });
  const parent = await insertParentProfile(db, "P", {
    id: `00000000-0000-4000-8b00-00000000${n}`,
    authSubject: `test-parent-${key}`,
    email: `parent-${key.toLowerCase()}@example.test`,
    displayName: `Test Parent ${key}`,
    role: "parent",
  });
  const source = await insertTestSource(db, `src-q-${key}`);
  const version = await insertTestVersion(db, { code: `TEST-Q-${key}`, subjectName: "Test Maths" });
  const first = await insertTestOutcomeTree(db, version.id, source.id, `${key}a`);
  const second = await insertTestOutcomeTree(db, version.id, source.id, `${key}b`);
  return { admin, parent, version, topic: first.topic, outcome: first.outcome, secondOutcome: second.outcome };
}

/** A valid number question: 12.50 + 3.25. Every call with the same overrides gives the same draft. */
export function buildDraft(bed: Pick<QuestionBed, "outcome">, overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    familyCode: "FIX-F01",
    familyTitle: "Fixture family",
    primaryOutcomeCode: bed.outcome.code,
    secondaryOutcomeCodes: [],
    questionType: "number",
    difficulty: "standard",
    cognitiveDemand: "application",
    marks: 2,
    estimatedSeconds: 60,
    content: {
      stem: [
        {
          t: "p",
          c: [
            { t: "text", v: "Ben has $12.50. He earns $3.25 more. How much does he have now? " },
            { t: "blank" },
          ],
        },
      ],
    },
    answer: { kind: "number", value: "15.75", unit: "$" },
    verification: { expression: "12.50+3.25" },
    workedSolution: [{ t: "p", c: [{ t: "text", v: "12.50 + 3.25 = 15.75" }] }],
    markingScheme: { method: "exact_with_unit" },
    provenance: "original_human",
    ...overrides,
  };
}

/** A multiple-choice question that only a person can verify. */
export function buildHumanCheckedDraft(bed: Pick<QuestionBed, "outcome">, overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  const option = (id: "A" | "B" | "C" | "D", v: string) => ({ id, c: [{ t: "text" as const, v }] });
  return buildDraft(bed, {
    familyCode: "FIX-F02",
    questionType: "mcq",
    marks: 1,
    content: {
      stem: [{ t: "p", c: [{ t: "text", v: "Which shape has 4 equal sides?" }] }],
      options: [option("A", "Square"), option("B", "Triangle"), option("C", "Circle"), option("D", "Hexagon")],
    },
    answer: { kind: "mcq", correct: "A" },
    verification: { human: true },
    markingScheme: { method: "exact" },
    ...overrides,
  });
}
