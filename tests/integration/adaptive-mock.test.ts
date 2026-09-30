import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { generateMock } from "@/application/commands/papers";
import { getAssessmentSetup } from "@/application/queries/assessment-setup";
import type { CurrentChild } from "@/application/queries/current-child";
import type { Database } from "@/repositories/postgres/client";
import { listPaperQuestionSets } from "@/repositories/postgres/papers";
import { assessmentBlueprints, papers } from "@/repositories/postgres/schema";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { playMock, requestKey } from "../helpers/play-mock";
import { seedRealBank } from "../helpers/seed-bank";
import { silentLogger } from "../helpers/silent-logger";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

type ReportTopic = { topicId: string; label: string; targetMarks: number; actualMarks: number; questionCount: number };
type Report = { scope: { topics: ReportTopic[] }; adaptive?: { mockNumber: number; focusTopicIds: string[] } };

describe("the adaptive next mock (M10)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parent: string;
  let child: CurrentChild;
  let assessmentId: string;
  let weakTopic: string;
  let mock1: Awaited<ReturnType<typeof playMock>>;

  const ctx = (now: Date) => ({ db, now, storage, logger: silentLogger });
  const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

  async function reportOf(paperId: string): Promise<Report> {
    const [paper] = await db.select().from(papers).where(eq(papers.id, paperId));
    return paper!.selectionReport as unknown as Report;
  }

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    storage = createMemoryStorage();
    await seedRealBank(db);
    parent = (await insertParentProfile(db, "A")).id;
    const made = await confirmedAssessment(db, parent, ["Fractions", "Whole numbers", "Adding and subtracting", "Times tables"], { nickname: "Darius", type: "end_of_year" });
    assessmentId = made.assessmentId;
    weakTopic = made.topicIds[0]!;
    child = { childId: made.childId, nickname: "Darius", deviceId: "device-a", parentProfileId: parent };
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("Mock 1 shares the marks evenly and describes itself the usual way", async () => {
    const setup = await getAssessmentSetup(parent, assessmentId, ctx(at(0)));
    expect(setup?.focusLine).toBeNull();
    // Mock 1 is played: everything right except the first topic, which is wrong throughout.
    mock1 = await playMock({ db, storage, parentProfileId: parent, child, assessmentId, key: 1, handedInAt: 900, plan: (_item, topicId) => (topicId === weakTopic ? "wrong" : "right") });
    const report = await reportOf(mock1.paperId);
    expect(report.adaptive).toBeUndefined();
    const targets = report.scope.topics.map((topic) => topic.targetMarks);
    expect(Math.max(...targets) - Math.min(...targets)).toBeLessThanOrEqual(1);
  });

  it("tells the parent what Mock 2 will lean towards, in plain words, and that every topic stays", async () => {
    const setup = await getAssessmentSetup(parent, assessmentId, ctx(at(1000)));
    console.log(JSON.stringify(await (await import("@/repositories/postgres/mastery")).listMasteryProfiles(db, child.childId)).slice(0, 600));
    expect(setup?.focusLine).toMatch(/^Mock 2 will focus a little more on .+, and still cover every topic\.$/);
    const fractions = setup!.chosenTopics.find((topic) => topic.id === weakTopic)!.label;
    expect(setup!.focusLine).toContain(fractions);
    expect(setup!.focusLine!.toLowerCase()).not.toMatch(/blueprint|weight|mastery|outcome|%/);
  });

  let mock2PaperId: string;

  it("Mock 2 puts more marks on the topic that was wrong, keeps every topic and the exact format, and avoids Mock 1's questions", async () => {
    const made = await generateMock(parent, assessmentId, requestKey(2), ctx(at(1100)));
    mock2PaperId = made.paperId;
    expect(made.number).toBe(2);
    const one = await reportOf(mock1.paperId);
    const two = await reportOf(mock2PaperId);
    const byTopic = (report: Report, topicId: string) => report.scope.topics.find((topic) => topic.topicId === topicId)!;

    // The design asked for more on the weak topic, and the paper delivers it.
    expect(byTopic(two, weakTopic).targetMarks).toBeGreaterThan(byTopic(one, weakTopic).targetMarks);
    expect(byTopic(two, weakTopic).actualMarks).toBeGreaterThan(byTopic(one, weakTopic).actualMarks);
    for (const topic of two.scope.topics.filter((entry) => entry.topicId !== weakTopic)) {
      expect(topic.targetMarks).toBeLessThan(byTopic(two, weakTopic).targetMarks);
      expect(byTopic(two, weakTopic).actualMarks).toBeGreaterThanOrEqual(topic.actualMarks);
    }
    // Hard rules: every confirmed topic still has questions, and the format is as exact as before.
    expect(two.scope.topics.every((topic) => topic.questionCount >= 1)).toBe(true);
    const marks = (report: Report) => report.scope.topics.reduce((sum, topic) => sum + topic.actualMarks, 0);
    expect(marks(two)).toBe(marks(one));
    expect(two.adaptive).toMatchObject({ mockNumber: 2, focusTopicIds: expect.arrayContaining([weakTopic]) });

    const sets = await listPaperQuestionSets(db, assessmentId);
    const first = new Set(sets.find((set) => set.paperId === mock1.paperId)!.questionIds);
    const second = sets.find((set) => set.paperId === mock2PaperId)!.questionIds;
    expect(second.some((id) => first.has(id))).toBe(false);
    expect(second).toHaveLength(mock1.items.length);
  });

  it("keeps the earlier mock's design as it was: a new blueprint version, never a changed one", async () => {
    const versions = await db.select().from(assessmentBlueprints).where(eq(assessmentBlueprints.assessmentId, assessmentId));
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const [one] = await db.select().from(papers).where(eq(papers.id, mock1.paperId));
    const [two] = await db.select().from(papers).where(eq(papers.id, mock2PaperId));
    expect(one!.blueprintId).not.toBe(two!.blueprintId);
  });

  it("uses the same rule every time: the same evidence gives the same design", async () => {
    const a = await getAssessmentSetup(parent, assessmentId, ctx(at(1200)));
    const b = await getAssessmentSetup(parent, assessmentId, ctx(at(1200)));
    expect(a?.focusLine).toBe(b?.focusLine);
    expect(a?.focusLine).toMatch(/^Mock 3 will focus/);
  });
});
