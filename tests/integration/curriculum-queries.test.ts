import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  getCurriculumTree,
  getCurriculumVersionForLevel,
  getOutcomeWithSources,
  listCurriculumVersions,
  listOutcomesForTopic,
} from "@/application/queries/curriculum";
import type { Database } from "@/repositories/postgres/client";
import { curriculumOutcomes, curriculumVersions } from "@/repositories/postgres/schema";
import { insertTestOutcomeTree, insertTestSource, insertTestVersion } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

async function setStatus(db: Database, versionId: string, status: "published" | "retired") {
  const values = status === "published" ? { status, publishedAt: new Date() } : { status };
  await db.update(curriculumVersions).set(values).where(eq(curriculumVersions.id, versionId));
}

describe("curriculum queries", () => {
  let testDb: TestDatabase;
  let db: Database;
  let sourceId: string;
  let draftId: string;
  let publishedId: string;
  let newerPublishedId: string;
  let retiredId: string;
  let publishedOutcomeId: string;
  let publishedTopicId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    sourceId = (await insertTestSource(db, "src-queries")).id;

    const published = await insertTestVersion(db, { code: "Q-PUB-2024", effectiveFrom: "2024-01-01" });
    const publishedTree = await insertTestOutcomeTree(db, published.id, sourceId, "1");
    publishedOutcomeId = publishedTree.outcome.id;
    publishedTopicId = publishedTree.topic.id;
    // A second, later outcome and topic in the same version, inserted out of order.
    await insertTestOutcomeTree(db, published.id, sourceId, "0");
    await setStatus(db, published.id, "published");
    publishedId = published.id;

    const newer = await insertTestVersion(db, { code: "Q-PUB-2025", effectiveFrom: "2025-10-01" });
    await insertTestOutcomeTree(db, newer.id, sourceId, "1");
    await setStatus(db, newer.id, "published");
    newerPublishedId = newer.id;

    const draft = await insertTestVersion(db, { code: "Q-DRAFT-2026", effectiveFrom: "2026-10-01" });
    await insertTestOutcomeTree(db, draft.id, sourceId, "1");
    draftId = draft.id;

    const retired = await insertTestVersion(db, { code: "Q-RETIRED-2020", effectiveFrom: "2020-01-01" });
    await insertTestOutcomeTree(db, retired.id, sourceId, "1");
    await setStatus(db, retired.id, "published");
    await setStatus(db, retired.id, "retired");
    retiredId = retired.id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("finds the newest published version for a subject and level, ignoring drafts and retired versions", async () => {
    const version = await getCurriculumVersionForLevel({ subject: "Test Subject", level: "P3", audience: "public" }, { db });
    expect(version?.id).toBe(newerPublishedId);
    expect(version?.status).toBe("published");
    expect(version?.subject).toBe("Test Subject");
  });

  it("lets the admin audience see the newest version of any status", async () => {
    const version = await getCurriculumVersionForLevel({ subject: "Test Subject", level: "P3", audience: "admin" }, { db });
    expect(version?.id).toBe(draftId);
  });

  it("returns nothing for a level or subject the curriculum does not cover", async () => {
    expect(await getCurriculumVersionForLevel({ subject: "Test Subject", level: "P4", audience: "admin" }, { db })).toBeNull();
    expect(await getCurriculumVersionForLevel({ subject: "Other Subject", level: "P3", audience: "admin" }, { db })).toBeNull();
  });

  it("lists every version, newest first, for admins", async () => {
    const versions = await listCurriculumVersions({ db });
    expect(versions.map((version) => version.code)).toEqual(["Q-DRAFT-2026", "Q-PUB-2025", "Q-PUB-2024", "Q-RETIRED-2020"]);
    expect(versions.map((version) => version.status)).toEqual(["draft", "published", "published", "retired"]);
  });

  it("returns the tree ordered by sort order then code", async () => {
    const tree = await getCurriculumTree(publishedId, { audience: "public" }, { db });
    expect(tree?.version.code).toBe("Q-PUB-2024");
    expect(tree?.domains.map((domain) => domain.code)).toEqual(["D0", "D1"]);
    expect(tree?.domains[1]?.topics[0]?.outcomes.map((outcome) => outcome.code)).toEqual(["O1"]);
  });

  it("hides draft and retired trees from the public audience but not from admins", async () => {
    expect(await getCurriculumTree(draftId, { audience: "public" }, { db })).toBeNull();
    expect(await getCurriculumTree(retiredId, { audience: "public" }, { db })).toBeNull();
    expect((await getCurriculumTree(draftId, { audience: "admin" }, { db }))?.domains).toHaveLength(1);
    expect((await getCurriculumTree(retiredId, { audience: "admin" }, { db }))?.domains).toHaveLength(1);
  });

  it("filters the tree by level and by topic", async () => {
    expect((await getCurriculumTree(publishedId, { audience: "public", level: "P4" }, { db }))?.domains).toEqual([]);
    const byTopic = await getCurriculumTree(publishedId, { audience: "public", topicId: publishedTopicId }, { db });
    expect(byTopic?.domains).toHaveLength(1);
    expect(byTopic?.domains[0]?.topics.map((topic) => topic.id)).toEqual([publishedTopicId]);
  });

  it("lists outcomes by topic within the version only", async () => {
    const outcomes = await listOutcomesForTopic(publishedId, publishedTopicId, { audience: "public" }, { db });
    expect(outcomes.map((outcome) => outcome.id)).toEqual([publishedOutcomeId]);
    // Same topic id, asked through another version: version scoping returns nothing.
    expect(await listOutcomesForTopic(newerPublishedId, publishedTopicId, { audience: "public" }, { db })).toEqual([]);
    expect(await listOutcomesForTopic(draftId, publishedTopicId, { audience: "public" }, { db })).toEqual([]);
  });

  it("returns an outcome with its sources, scoped to the version", async () => {
    const detail = await getOutcomeWithSources(publishedId, publishedOutcomeId, { audience: "public" }, { db });
    expect(detail).toMatchObject({
      id: publishedOutcomeId,
      code: "O1",
      verification: "unverified",
      curriculumVersionId: publishedId,
      topicCode: "T1",
    });
    expect(detail?.sources).toEqual([
      expect.objectContaining({ sourceCode: "src-queries", pageOrSection: "p. 1", provenance: "official_moe", publisher: "Test Publisher" }),
    ]);
    expect(await getOutcomeWithSources(newerPublishedId, publishedOutcomeId, { audience: "public" }, { db })).toBeNull();
  });

  it("does not show sources of a draft outcome to the public audience", async () => {
    const [draftOutcome] = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.curriculumVersionId, draftId));
    expect(await getOutcomeWithSources(draftId, draftOutcome?.id ?? "", { audience: "public" }, { db })).toBeNull();
    expect(await getOutcomeWithSources(draftId, draftOutcome?.id ?? "", { audience: "admin" }, { db })).not.toBeNull();
  });
});
