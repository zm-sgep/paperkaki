import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { setPaperFormat, setPaperSettings, resetToRecommendedSettings, confirmScope, createAssessment, setAssessmentScope } from "@/application/commands/assessments";
import { generateMock } from "@/application/commands/papers";
import { InputError, NotFoundError } from "@/application/errors";
import { getAssessmentSetup, getScopeSetup } from "@/application/queries/assessment-setup";
import { END_OF_YEAR_COMMON_FORMAT, WEIGHTED_COMMON_FORMAT, type PaperFormat } from "@/domain/assessments";
import type { Database } from "@/repositories/postgres/client";
import { getLatestBlueprint, getSchoolPaperFormat, upsertSchoolPaperFormat } from "@/repositories/postgres/assessments";
import { assessmentRequirements, paperQuestions, schoolPaperFormats, auditLogs } from "@/repositories/postgres/schema";
import { parsePaperFormat } from "@/schemas/paper-format";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, DATE_OK, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage } from "../helpers/memory-storage";
import { BANK_TOPICS } from "../helpers/question-bank";
import { seedRealBank } from "../helpers/seed-bank";
import { silentLogger } from "../helpers/silent-logger";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const ALL_TOPICS = BANK_TOPICS.map((topic) => topic.label);
const key = (n: number): string => `00000000-0000-4000-8000-${String(n + 900).padStart(12, "0")}`;

/** "Booklet A" / "Booklet B" style parts: what a parent who matches their school's paper might type. */
const BOOKLETS: PaperFormat = {
  durationMinutes: 60,
  sections: [
    { label: "Booklet A", kind: "mcq", questionCount: 10, totalMarks: 10, marksEach: 1 },
    { label: "Booklet B", kind: "short", questionCount: 20, totalMarks: 30 },
  ],
};

describe("paper formats (data, commands and the setup screen)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let parentA: string;
  let parentB: string;
  const ctx = () => ({ db, now: NOW });
  const requirements = async (assessmentId: string) =>
    (await db.select().from(assessmentRequirements).where(eq(assessmentRequirements.assessmentId, assessmentId)))[0];

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await seedRealBank(db);
    parentA = (await insertParentProfile(db, "A")).id;
    parentB = (await insertParentProfile(db, "B")).id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("recommends the common end-of-year format for an end-of-year exam, and stores it as the recommendation", async () => {
    const { assessmentId } = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child E", type: "end_of_year" });
    const setup = await getAssessmentSetup(parentA, assessmentId, ctx());
    expect(setup?.summary).toBe("50 marks · 1 h 30 min · Sections A, B, C");
    expect(setup?.chosenTopics).toHaveLength(11);
    expect(setup?.topicsLine).toContain("Fractions");
    expect(setup?.usingRecommended).toBe(true);
    expect(setup?.problems).toEqual([]);
    expect(setup?.canGenerate).toBe(true);
    expect(setup?.paperFormat.selected).toBe("p3_end_of_year_common");
    expect(setup?.paperFormat.choices.map((c) => [c.id, c.recommended])).toEqual([
      ["p3_end_of_year_common", true],
      ["standard", false],
      ["p3_weighted_common", false],
    ]);
    expect(setup?.paperFormat.choices[0]?.title).toBe("Common Primary 3 end-of-year format (Sections A, B, C · 50 marks · 1 h 30 min)");
    expect(setup?.paperFormat.marksAndTimeEditable).toBe(false);
    expect(setup?.paperFormat.futureLabel).toBe("Use this format for Test Child E's future end-of-year exam papers");

    // Stored on the requirements and in the blueprint spec.
    const stored = await requirements(assessmentId);
    expect(stored).toMatchObject({ totalMarks: 50, durationMinutes: 90, source: "recommended" });
    expect(parsePaperFormat(stored?.paperFormat)).toEqual(END_OF_YEAR_COMMON_FORMAT);
    const blueprint = await getLatestBlueprint(db, assessmentId);
    expect(parsePaperFormat(blueprint?.spec.format)).toEqual(END_OF_YEAR_COMMON_FORMAT);
    expect(blueprint?.spec).toMatchObject({ totalMarks: 50, durationMinutes: 90 });
  });

  it("recommends the standard mock for a weighted assessment", async () => {
    const { assessmentId } = await confirmedAssessment(db, parentA, ["Fractions", "Whole numbers", "Adding and subtracting"], { nickname: "Test Child W" });
    const setup = await getAssessmentSetup(parentA, assessmentId, ctx());
    expect(setup?.paperFormat.selected).toBe("standard");
    expect(setup?.paperFormat.choices[0]).toMatchObject({ id: "standard", recommended: true });
    expect(setup?.paperFormat.marksAndTimeEditable).toBe(true);
    expect((await requirements(assessmentId))?.paperFormat).toBeNull();
  });

  it("switches to a ready-made format, keeps difficulty, and follows the format's marks and time", async () => {
    const { assessmentId } = await confirmedAssessment(db, parentA, ["Fractions", "Whole numbers", "Adding and subtracting", "Money", "Time", "Area"], { nickname: "Test Child S" });
    await setPaperSettings(parentA, assessmentId, { totalMarks: 30, durationMinutes: 40, difficulty: "harder" }, ctx());
    await setPaperFormat(parentA, assessmentId, { choice: "p3_weighted_common" }, ctx());
    expect(await requirements(assessmentId)).toMatchObject({ totalMarks: 20, durationMinutes: 30, difficulty: "harder", source: "parent" });
    let setup = await getAssessmentSetup(parentA, assessmentId, ctx());
    expect(setup?.summary).toBe("20 marks · 30 min · Sections A, B");
    expect(setup?.paperFormat.selected).toBe("p3_weighted_common");
    expect(setup?.settings.difficulty).toBe("harder");

    // Difficulty alone keeps the format.
    await setPaperSettings(parentA, assessmentId, { difficulty: "easier" }, ctx());
    expect(parsePaperFormat((await requirements(assessmentId))?.paperFormat)).toEqual(WEIGHTED_COMMON_FORMAT);
    expect(await requirements(assessmentId)).toMatchObject({ totalMarks: 20, durationMinutes: 30, difficulty: "easier" });

    // Back to the standard mock: marks and time are the recommendation again.
    await setPaperFormat(parentA, assessmentId, { choice: "standard" }, ctx());
    setup = await getAssessmentSetup(parentA, assessmentId, ctx());
    expect(setup?.paperFormat.selected).toBe("standard");
    expect(setup?.summary).toBe("40 marks · 45 min · Sections A, B");
    expect((await requirements(assessmentId))?.paperFormat).toBeNull();

    // "Use recommended settings" returns to the recommendation for this assessment.
    await setPaperFormat(parentA, assessmentId, { choice: "p3_end_of_year_common" }, ctx());
    await resetToRecommendedSettings(parentA, assessmentId, ctx());
    expect(await requirements(assessmentId)).toMatchObject({ source: "recommended", totalMarks: 40, durationMinutes: 45, paperFormat: null });
  });

  it("stores a version of the blueprint each time the format changes, and not when it does not", async () => {
    const { assessmentId } = await confirmedAssessment(db, parentA, ["Fractions", "Whole numbers", "Adding and subtracting", "Money", "Time", "Area"], { nickname: "Test Child V" });
    const before = (await getLatestBlueprint(db, assessmentId))?.version ?? 0;
    await setPaperFormat(parentA, assessmentId, { choice: "p3_weighted_common" }, ctx());
    const after = (await getLatestBlueprint(db, assessmentId))?.version ?? 0;
    expect(after).toBe(before + 1);
    await setPaperFormat(parentA, assessmentId, { choice: "p3_weighted_common" }, ctx());
    expect((await getLatestBlueprint(db, assessmentId))?.version).toBe(after);
  });

  it("matches the school's paper: stores the parts, saves it for the child, and the next assessment starts from it", async () => {
    const first = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child C", type: "end_of_year" });
    await setPaperFormat(parentA, first.assessmentId, { choice: "custom", customFormat: BOOKLETS, saveForFuture: true }, ctx());

    const stored = await requirements(first.assessmentId);
    expect(stored).toMatchObject({ totalMarks: 40, durationMinutes: 60, source: "parent" });
    expect(parsePaperFormat(stored?.paperFormat)).toEqual(BOOKLETS);
    const setup = await getAssessmentSetup(parentA, first.assessmentId, ctx());
    expect(setup?.summary).toBe("40 marks · 1 h · Booklet A, Booklet B");
    // A format saved for the child shows as the saved choice; one kept for this assessment only shows as the parent's own.
    expect(setup?.paperFormat.selected).toBe("saved");
    expect(setup?.paperFormat.current.parts.map((p) => p.label)).toEqual(["Booklet A", "Booklet B"]);
    expect(setup?.problems).toEqual([]);
    expect(setup?.canGenerate).toBe(true);
    const spec = (await getLatestBlueprint(db, first.assessmentId))?.spec;
    expect(parsePaperFormat(spec?.format)).toEqual(BOOKLETS);

    // Saved for this child and this kind of assessment.
    expect(parsePaperFormat(await getSchoolPaperFormat(db, parentA, first.childId, "end_of_year"))).toEqual(BOOKLETS);
    expect(await getSchoolPaperFormat(db, parentA, first.childId, "wa2")).toBeNull();

    // The next end-of-year assessment of the same child starts from the saved format.
    const next = await confirmedAssessment(db, parentA, ALL_TOPICS, { childId: first.childId, type: "end_of_year" });
    const nextSetup = await getAssessmentSetup(parentA, next.assessmentId, ctx());
    expect(nextSetup?.summary).toBe("40 marks · 1 h · Booklet A, Booklet B");
    expect(nextSetup?.usingRecommended).toBe(true);
    expect(nextSetup?.paperFormat.choices.map((c) => [c.id, c.recommended])).toEqual([
      ["saved", true],
      ["p3_end_of_year_common", false],
      ["standard", false],
      ["p3_weighted_common", false],
    ]);
    expect(nextSetup?.paperFormat.selected).toBe("saved");

    // A WA2 for the same child is not affected.
    const wa = await confirmedAssessment(db, parentA, ["Fractions", "Whole numbers", "Adding and subtracting"], { childId: first.childId });
    expect((await getAssessmentSetup(parentA, wa.assessmentId, ctx()))?.paperFormat.selected).toBe("standard");

    // The saved format can be chosen again explicitly.
    await setPaperFormat(parentA, wa.assessmentId, { choice: "custom", customFormat: { ...BOOKLETS, durationMinutes: 45 }, saveForFuture: false }, ctx());
    expect(await getSchoolPaperFormat(db, parentA, first.childId, "wa2")).toBeNull();
    await expect(setPaperFormat(parentA, wa.assessmentId, { choice: "saved" }, ctx())).rejects.toBeInstanceOf(InputError);
  });

  it("saving again replaces the saved format: one row per child and assessment type", async () => {
    const { assessmentId, childId } = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child R", type: "end_of_year" });
    await setPaperFormat(parentA, assessmentId, { choice: "custom", customFormat: BOOKLETS }, ctx());
    await setPaperFormat(parentA, assessmentId, { choice: "custom", customFormat: { ...BOOKLETS, durationMinutes: 75 } }, ctx());
    const rows = await db.select().from(schoolPaperFormats).where(eq(schoolPaperFormats.childId, childId));
    expect(rows).toHaveLength(1);
    expect(parsePaperFormat(rows[0]?.format)?.durationMinutes).toBe(75);
  });

  it("explains a custom format that does not add up, part by part, and saves nothing", async () => {
    const { assessmentId, childId } = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child X", type: "end_of_year" });
    const bad: PaperFormat = {
      durationMinutes: 60,
      sections: [
        { label: "Section A", kind: "mcq", questionCount: 6, totalMarks: 12 },
        { label: "Section B", kind: "short", questionCount: 16, totalMarks: 40 },
      ],
    };
    const error = await setPaperFormat(parentA, assessmentId, { choice: "custom", customFormat: bad }, ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InputError);
    expect((error as InputError).fieldErrors["part-1"]).toBe(
      "Section B: 16 questions can't add up to 40 marks. Short questions are worth 1 or 2 marks, so use 16 to 32 marks.",
    );
    expect((error as InputError).fieldErrors["part-0"]).toBeUndefined();
    expect(await getSchoolPaperFormat(db, parentA, childId, "end_of_year")).toBeNull();
    expect((await requirements(assessmentId))?.paperFormat).toEqual(expect.anything());
    expect(parsePaperFormat((await requirements(assessmentId))?.paperFormat)).toEqual(END_OF_YEAR_COMMON_FORMAT);

    for (const customFormat of [null, "x", { durationMinutes: 60 }, { durationMinutes: 60, sections: [] }]) {
      await expect(setPaperFormat(parentA, assessmentId, { choice: "custom", customFormat }, ctx())).rejects.toBeInstanceOf(InputError);
    }
    await expect(setPaperFormat(parentA, assessmentId, { choice: "nonsense" }, ctx())).rejects.toBeInstanceOf(InputError);
  });

  it("tells the parent when the bank cannot fill a format, without internal words", async () => {
    const { assessmentId } = await confirmedAssessment(db, parentA, ["Fractions"], { nickname: "Test Child T", type: "end_of_year" });
    const setup = await getAssessmentSetup(parentA, assessmentId, ctx());
    expect(setup?.canGenerate).toBe(false);
    // With one topic, a 50-mark three-section paper cannot be filled; the reason is in plain words.
    expect(setup?.problems.join(" ")).toMatch(/We (can't|don't)/);
    expect(setup?.problems.join(" ")).toMatch(/Try changing the marks or the number of questions, or add a topic\./);
    expect(setup?.problems.join(" ")).not.toMatch(/blueprint|outcome|inventory|preset|kind/i);
    await expect(generateMock(parentA, assessmentId, key(1), { ...ctx(), storage: createMemoryStorage(), logger: silentLogger })).rejects.toMatchObject({ code: "blocked" });
  });

  it("generates a mock in the chosen format and records the parts on the paper", async () => {
    const { assessmentId } = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child G", type: "end_of_year" });
    await setPaperFormat(parentA, assessmentId, { choice: "custom", customFormat: BOOKLETS, saveForFuture: false }, ctx());
    const result = await generateMock(parentA, assessmentId, key(2), { ...ctx(), storage: createMemoryStorage(), logger: silentLogger });
    const rows = await db.select().from(paperQuestions).where(eq(paperQuestions.paperId, result.paperId)).orderBy(asc(paperQuestions.position));
    expect(rows).toHaveLength(30);
    expect(rows.slice(0, 10).every((r) => r.sectionCode === "A" && r.marks === 1)).toBe(true);
    expect(rows.slice(10).every((r) => r.sectionCode === "B")).toBe(true);
    expect(rows.slice(10).reduce((total, r) => total + r.marks, 0)).toBe(30);
  });

  it("the common end-of-year format generates on the real bank for all eleven topics", async () => {
    const { assessmentId } = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child H", type: "end_of_year" });
    const result = await generateMock(parentA, assessmentId, key(3), { ...ctx(), storage: createMemoryStorage(), logger: silentLogger });
    const rows = await db.select().from(paperQuestions).where(eq(paperQuestions.paperId, result.paperId)).orderBy(asc(paperQuestions.position));
    const bySection = (code: string) => rows.filter((r) => r.sectionCode === code);
    expect([bySection("A").length, bySection("B").length, bySection("C").length]).toEqual([6, 16, 4]);
    expect([bySection("A"), bySection("B"), bySection("C")].map((s) => s.reduce((t, r) => t + r.marks, 0))).toEqual([12, 26, 12]);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });

  it("only the owner can set a format or read a saved one", async () => {
    const { assessmentId, childId } = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child O", type: "end_of_year" });
    await setPaperFormat(parentA, assessmentId, { choice: "custom", customFormat: BOOKLETS }, ctx());
    await expect(setPaperFormat(parentB, assessmentId, { choice: "p3_weighted_common" }, ctx())).rejects.toBeInstanceOf(NotFoundError);
    expect(await getSchoolPaperFormat(db, parentB, childId, "end_of_year")).toBeNull();
    expect(await upsertSchoolPaperFormat(db, parentB, childId, "end_of_year", { ...BOOKLETS })).toBe(false);
    expect(await getSchoolPaperFormat(db, parentB, "not-a-uuid", "end_of_year")).toBeNull();
    expect(parsePaperFormat(await getSchoolPaperFormat(db, parentA, childId, "end_of_year"))).toEqual(BOOKLETS);
    expect(await getAssessmentSetup(parentB, assessmentId, ctx())).toBeNull();

    // Parent B's own child never sees parent A's saved format.
    const b = await confirmedAssessment(db, parentB, ALL_TOPICS, { nickname: "Test Child P", type: "end_of_year" });
    expect((await getAssessmentSetup(parentB, b.assessmentId, ctx()))?.paperFormat.selected).toBe("p3_end_of_year_common");
  });

  it("records the choice in the audit log without the parts' names", async () => {
    const { assessmentId } = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child L", type: "end_of_year" });
    await setPaperFormat(parentA, assessmentId, { choice: "custom", customFormat: BOOKLETS }, ctx());
    const events = (await db.select().from(auditLogs)).filter((e) => e.action === "assessment.paper_format_set" && e.entityId === assessmentId);
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toEqual({ choice: "custom", totalMarks: 40, partCount: 2, savedForFuture: true });
  });

  it("a scope change keeps the parent's own format", async () => {
    const { assessmentId, topicIds } = await confirmedAssessment(db, parentA, ALL_TOPICS, { nickname: "Test Child K", type: "end_of_year" });
    await setPaperFormat(parentA, assessmentId, { choice: "custom", customFormat: BOOKLETS, saveForFuture: false }, ctx());
    await setAssessmentScope(parentA, assessmentId, topicIds.slice(0, 5), ctx());
    await confirmScope(parentA, assessmentId, ctx());
    const setup = await getAssessmentSetup(parentA, assessmentId, ctx());
    expect(setup?.summary).toBe("40 marks · 1 h · Booklet A, Booklet B");
    expect(setup?.paperFormat.selected).toBe("custom");
  });

  it("a new assessment still needs its topics confirmed before a format applies", async () => {
    const assessment = await createAssessment(parentA, { newChildNickname: "Test Child N", type: "end_of_year", date: DATE_OK }, ctx());
    const topics = await getScopeSetup(parentA, assessment.id, ctx());
    expect(topics?.topics.length).toBe(11);
    await expect(setPaperFormat(parentA, assessment.id, { choice: "p3_weighted_common" }, ctx())).resolves.toBeUndefined();
    expect(await getLatestBlueprint(db, assessment.id)).toBeNull();
  });
});
