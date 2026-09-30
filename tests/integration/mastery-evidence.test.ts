import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createChild } from "@/application/commands/children";
import { ensureEvidenceForChild, rebuildMasteryProfiles, recordAttemptEvidence } from "@/application/mastery";
import type { CurrentChild } from "@/application/queries/current-child";
import type { Database } from "@/repositories/postgres/client";
import { listEvidenceForChild, listMasteryProfiles } from "@/repositories/postgres/mastery";
import { attemptSessions, masteryEvidence, masteryProfiles } from "@/repositories/postgres/schema";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { playMock } from "../helpers/play-mock";
import { BANK_TOPICS } from "../helpers/question-bank";
import { seedRealBank } from "../helpers/seed-bank";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

describe("mastery evidence and profiles (M8)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parent: string;
  let child: CurrentChild;
  let assessmentId: string;
  let first: Awaited<ReturnType<typeof playMock>>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    storage = createMemoryStorage();
    await seedRealBank(db);
    parent = (await insertParentProfile(db, "A")).id;
    const made = await confirmedAssessment(db, parent, BANK_TOPICS.map((topic) => topic.label), { nickname: "Darius", type: "end_of_year" });
    assessmentId = made.assessmentId;
    child = { childId: made.childId, nickname: "Darius", deviceId: "device-a", parentProfileId: parent };
    // Every other family's child exists too, to prove evidence is never shared.
    await createChild((await insertParentProfile(db, "B")).id, { nickname: "Test Child B" }, { db, now: NOW });
    first = await playMock({
      db,
      storage,
      parentProfileId: parent,
      child,
      assessmentId,
      key: 1,
      plan: (item) => (item.position % 4 === 0 ? "wrong" : item.position % 7 === 0 ? "blank" : "right"),
    });
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("writes one piece of evidence per marked answer, as soon as a mock is marked by rule", async () => {
    const [attempt] = await db.select().from(attemptSessions).where(eq(attemptSessions.id, first.attemptId));
    expect(attempt?.status).toBe("marked");
    const evidence = await listEvidenceForChild(db, child.childId);
    expect(evidence).toHaveLength(first.items.length);
    for (const entry of evidence) {
      expect(entry).toMatchObject({ childId: child.childId, sourceKind: "mock", attemptId: first.attemptId, firstAttempt: true, practiceSessionId: null });
    }
    const byQuestion = new Map(evidence.map((entry) => [entry.questionId, entry]));
    for (const item of first.items) {
      const entry = byQuestion.get(item.question.id);
      expect(entry, `question ${item.position}`).toBeDefined();
      expect(entry?.scoreRatio).toBe(item.played === "right" ? 1 : 0);
      expect(entry?.difficulty).toBe(item.question.difficulty);
      expect(entry?.familyId).toBe(item.question.familyId);
      expect(entry?.questionType).toBe(item.question.questionType);
    }
  });

  it("is idempotent on the source answers: running it again writes nothing", async () => {
    const before = await db.select().from(masteryEvidence);
    expect(await recordAttemptEvidence(db, first.attemptId, new Date(NOW.getTime() + 900_000))).toBe(0);
    expect(await ensureEvidenceForChild(db, child.childId, new Date(NOW.getTime() + 900_000))).toBe(0);
    expect(await db.select().from(masteryEvidence)).toHaveLength(before.length);
  });

  it("keeps a cached profile for every outcome that has evidence, worked out from that evidence", async () => {
    const evidence = await listEvidenceForChild(db, child.childId);
    const outcomes = new Set(evidence.map((entry) => entry.outcomeId));
    const profiles = await listMasteryProfiles(db, child.childId);
    expect(new Set(profiles.map((profile) => profile.outcomeId))).toEqual(outcomes);
    for (const profile of profiles) {
      expect(profile.policyVersion).toBe("mastery-policy-v1");
      const counted = evidence.filter((entry) => entry.outcomeId === profile.outcomeId && entry.firstAttempt).length;
      expect(profile.evidenceCount).toBe(counted);
      expect(profile.sessions).toBe(1);
      // One mock alone can never show more than "getting there".
      expect(["learning", "developing"]).toContain(profile.state);
    }
  });

  it("can throw the cache away and rebuild the same profiles from the evidence", async () => {
    const stable = (rows: Awaited<ReturnType<typeof listMasteryProfiles>>) => rows.map((row) => ({ ...row, id: undefined, computedAt: undefined }));
    const before = stable(await listMasteryProfiles(db, child.childId));
    await db.delete(masteryProfiles);
    expect(await listMasteryProfiles(db, child.childId)).toHaveLength(0);
    await rebuildMasteryProfiles(db, child.childId, new Date(NOW.getTime() + 900_000));
    const after = stable(await listMasteryProfiles(db, child.childId));
    expect(after).toEqual(before);
  });

  it("catches up a marked mock that has no evidence yet, exactly once", async () => {
    await db.delete(masteryProfiles);
    await db.delete(masteryEvidence);
    expect(await ensureEvidenceForChild(db, child.childId, new Date(NOW.getTime() + 900_000))).toBe(1);
    expect(await listEvidenceForChild(db, child.childId)).toHaveLength(first.items.length);
    expect((await listMasteryProfiles(db, child.childId)).length).toBeGreaterThan(0);
    expect(await ensureEvidenceForChild(db, child.childId, new Date(NOW.getTime() + 900_000))).toBe(0);
  });

  it("marks a repeated question as a retry, not a first attempt", async () => {
    // A second mock avoids the first paper's questions where it can; whatever it repeats is not a first attempt.
    const second = await playMock({ db, storage, parentProfileId: parent, child, assessmentId, key: 2, handedInAt: 4000, plan: () => "right" });
    const evidence = await listEvidenceForChild(db, child.childId);
    const seen = new Set(first.items.map((item) => item.question.id));
    for (const entry of evidence.filter((row) => row.attemptId === second.attemptId)) {
      expect(entry.firstAttempt).toBe(!seen.has(entry.questionId));
    }
    expect(evidence).toHaveLength(first.items.length + second.items.length);
  });

  it("never mixes children: another child's profile is empty", async () => {
    const other = await createChild(parent, { nickname: "Sibling" }, { db, now: NOW });
    expect(await listEvidenceForChild(db, other.id)).toHaveLength(0);
    expect(await listMasteryProfiles(db, other.id)).toHaveLength(0);
  });
});
