import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/repositories/postgres/client";
import {
  curriculumDomains,
  curriculumOutcomeSources,
  curriculumOutcomes,
  curriculumTopics,
  curriculumVersions,
  outcomeRelationships,
} from "@/repositories/postgres/schema";
import { insertParentProfile, insertTestOutcomeTree, insertTestSource, insertTestVersion } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

/** Drizzle wraps driver errors; the database's own message is on `cause`. */
async function rejectionMessage(promise: PromiseLike<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    return `${error instanceof Error ? error.message : String(error)} ${cause}`;
  }
  throw new Error("expected the statement to be rejected");
}

describe("curriculum schema", () => {
  let testDb: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("creates the curriculum tables", async () => {
    const result = (await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )) as unknown as { rows: { table_name: string }[] };
    expect(result.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "curriculum_domains",
        "curriculum_outcome_sources",
        "curriculum_outcomes",
        "curriculum_topics",
        "curriculum_versions",
        "outcome_relationships",
        "source_documents",
        "subjects",
      ]),
    );
  });

  it("uses ON DELETE RESTRICT for every foreign key between curriculum tables", async () => {
    const result = (await db.execute(sql`
      select tc.table_name, tc.constraint_name, rc.delete_rule
      from information_schema.table_constraints tc
      join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
        and (tc.table_name like 'curriculum_%' or tc.table_name in ('outcome_relationships', 'source_documents', 'subjects'))
    `)) as unknown as { rows: { table_name: string; delete_rule: string }[] };
    expect(result.rows.length).toBeGreaterThanOrEqual(12);
    expect(result.rows.filter((row) => row.delete_rule !== "RESTRICT")).toEqual([]);
  });

  it("keeps codes unique within a version but reusable across versions", async () => {
    const source = await insertTestSource(db, "src-unique");
    const a = await insertTestVersion(db, { code: "UNIQ-A" });
    const b = await insertTestVersion(db, { code: "UNIQ-B" });
    await insertTestOutcomeTree(db, a.id, source.id, "1");
    await insertTestOutcomeTree(db, b.id, source.id, "1");

    await expect(insertTestOutcomeTree(db, a.id, source.id, "1")).rejects.toThrow();
    await expect(insertTestVersion(db, { code: "UNIQ-A" })).rejects.toThrow();
  });

  it("does not store the same source link twice, with or without a page", async () => {
    const source = await insertTestSource(db, "src-dup");
    const version = await insertTestVersion(db, { code: "DUP-V" });
    const { outcome } = await insertTestOutcomeTree(db, version.id, source.id, "1");
    await expect(
      db.insert(curriculumOutcomeSources).values({ outcomeId: outcome.id, sourceId: source.id, pageOrSection: "p. 1" }),
    ).rejects.toThrow();
    await db.insert(curriculumOutcomeSources).values({ outcomeId: outcome.id, sourceId: source.id, pageOrSection: null });
    await expect(
      db.insert(curriculumOutcomeSources).values({ outcomeId: outcome.id, sourceId: source.id, pageOrSection: null }),
    ).rejects.toThrow();
  });

  it("refuses a verified outcome without a named verifier", async () => {
    const source = await insertTestSource(db, "src-verify");
    const version = await insertTestVersion(db, { code: "VERIFY-V" });
    const { outcome } = await insertTestOutcomeTree(db, version.id, source.id, "1");
    await expect(
      db.update(curriculumOutcomes).set({ verification: "verified" }).where(eq(curriculumOutcomes.id, outcome.id)),
    ).rejects.toThrow();
    const admin = await insertParentProfile(db, "V", { role: "admin" });
    await db
      .update(curriculumOutcomes)
      .set({ verification: "verified", verifiedBy: admin.id, verifiedAt: new Date() })
      .where(eq(curriculumOutcomes.id, outcome.id));
  });

  it("refuses an outcome that relates to itself", async () => {
    const source = await insertTestSource(db, "src-self");
    const version = await insertTestVersion(db, { code: "SELF-V" });
    const { outcome } = await insertTestOutcomeTree(db, version.id, source.id, "1");
    await expect(
      db.insert(outcomeRelationships).values({ fromOutcomeId: outcome.id, toOutcomeId: outcome.id, kind: "prerequisite" }),
    ).rejects.toThrow();
  });

  it("never cascades: deleting a version, topic or outcome that has children is refused", async () => {
    const source = await insertTestSource(db, "src-restrict");
    const version = await insertTestVersion(db, { code: "RESTRICT-V" });
    const { topic, outcome } = await insertTestOutcomeTree(db, version.id, source.id, "1");
    await expect(db.delete(curriculumOutcomes).where(eq(curriculumOutcomes.id, outcome.id))).rejects.toThrow();
    await expect(db.delete(curriculumTopics).where(eq(curriculumTopics.id, topic.id))).rejects.toThrow();
    await expect(db.delete(curriculumVersions).where(eq(curriculumVersions.id, version.id))).rejects.toThrow();
    await expect(db.delete(curriculumDomains).where(eq(curriculumDomains.id, topic.domainId))).rejects.toThrow();
  });
});

describe("published version trigger", () => {
  let testDb: TestDatabase;
  let db: Database;
  let versionId: string;
  let outcomeId: string;
  let topicId: string;
  let domainId: string;
  let sourceId: string;
  let draftOutcomeId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    const source = await insertTestSource(db, "src-trigger");
    sourceId = source.id;
    const version = await insertTestVersion(db, { code: "TRIGGER-V" });
    versionId = version.id;
    const tree = await insertTestOutcomeTree(db, version.id, source.id, "1");
    outcomeId = tree.outcome.id;
    topicId = tree.topic.id;
    domainId = tree.topic.domainId;
    const second = await insertTestOutcomeTree(db, version.id, source.id, "2");
    draftOutcomeId = second.outcome.id;
    await db.insert(outcomeRelationships).values({
      fromOutcomeId: outcomeId,
      toOutcomeId: draftOutcomeId,
      kind: "progression",
    });
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("allows every edit while the version is a draft", async () => {
    await db.update(curriculumOutcomes).set({ statement: "Edited in draft" }).where(eq(curriculumOutcomes.id, draftOutcomeId));
    await db.update(curriculumTopics).set({ title: "Edited topic" }).where(eq(curriculumTopics.id, topicId));
    await db.update(curriculumDomains).set({ title: "Edited domain" }).where(eq(curriculumDomains.id, domainId));
    await db.update(curriculumOutcomeSources).set({ pageOrSection: "p. 2" }).where(eq(curriculumOutcomeSources.outcomeId, draftOutcomeId));
    await db.update(curriculumOutcomeSources).set({ pageOrSection: "p. 1" }).where(eq(curriculumOutcomeSources.outcomeId, draftOutcomeId));
  });

  it("refuses to publish a version while an outcome has no source link", async () => {
    const version = await insertTestVersion(db, { code: "UNSOURCED-V" });
    const tree = await insertTestOutcomeTree(db, version.id, sourceId, "9");
    await db.delete(curriculumOutcomeSources).where(eq(curriculumOutcomeSources.outcomeId, tree.outcome.id));
    const message = await rejectionMessage(
      db.update(curriculumVersions).set({ status: "published", publishedAt: new Date() }).where(eq(curriculumVersions.id, version.id)),
    );
    expect(message).toMatch(/no source link/);
  });

  describe("once published", () => {
    beforeAll(async () => {
      await db
        .update(curriculumVersions)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(curriculumVersions.id, versionId));
    });

    it("rejects UPDATE and DELETE of outcomes", async () => {
      expect(
        await rejectionMessage(db.update(curriculumOutcomes).set({ statement: "Changed" }).where(eq(curriculumOutcomes.id, outcomeId))),
      ).toMatch(/published/);
      expect(await rejectionMessage(db.delete(curriculumOutcomes).where(eq(curriculumOutcomes.id, outcomeId)))).toMatch(/published/);
    });

    it("rejects UPDATE and DELETE of topics and domains", async () => {
      expect(await rejectionMessage(db.update(curriculumTopics).set({ title: "Changed" }).where(eq(curriculumTopics.id, topicId)))).toMatch(/published/);
      expect(await rejectionMessage(db.delete(curriculumTopics).where(eq(curriculumTopics.id, topicId)))).toMatch(/published/);
      expect(await rejectionMessage(db.update(curriculumDomains).set({ title: "Changed" }).where(eq(curriculumDomains.id, domainId)))).toMatch(/published/);
      expect(await rejectionMessage(db.delete(curriculumDomains).where(eq(curriculumDomains.id, domainId)))).toMatch(/published/);
    });

    it("rejects UPDATE and DELETE of outcome sources, and new links", async () => {
      expect(
        await rejectionMessage(db.update(curriculumOutcomeSources).set({ pageOrSection: "p. 99" }).where(eq(curriculumOutcomeSources.outcomeId, outcomeId))),
      ).toMatch(/published/);
      expect(await rejectionMessage(db.delete(curriculumOutcomeSources).where(eq(curriculumOutcomeSources.outcomeId, outcomeId)))).toMatch(/published/);
      expect(
        await rejectionMessage(db.insert(curriculumOutcomeSources).values({ outcomeId, sourceId, pageOrSection: "p. 7" })),
      ).toMatch(/published/);
    });

    it("rejects relationship edits and new content in the published version", async () => {
      expect(await rejectionMessage(db.delete(outcomeRelationships).where(eq(outcomeRelationships.fromOutcomeId, outcomeId)))).toMatch(/published/);
      expect(
        await rejectionMessage(
          db.insert(curriculumDomains).values({ curriculumVersionId: versionId, code: "LATE", title: "Late domain" }),
        ),
      ).toMatch(/published/);
    });

    it("rejects editing the version row, except moving it to retired", async () => {
      expect(
        await rejectionMessage(db.update(curriculumVersions).set({ title: "Renamed" }).where(eq(curriculumVersions.id, versionId))),
      ).toMatch(/only moving it to retired/);
      expect(await rejectionMessage(db.update(curriculumVersions).set({ status: "draft" }).where(eq(curriculumVersions.id, versionId)))).toMatch(/published/);
      expect(await rejectionMessage(db.delete(curriculumVersions).where(eq(curriculumVersions.id, versionId)))).toMatch(/cannot be deleted/);
    });

    it("allows retiring the version, then keeps it frozen", async () => {
      await db.update(curriculumVersions).set({ status: "retired" }).where(eq(curriculumVersions.id, versionId));
      const [row] = await db.select().from(curriculumVersions).where(eq(curriculumVersions.id, versionId));
      expect(row?.status).toBe("retired");
      expect(await rejectionMessage(db.update(curriculumOutcomes).set({ statement: "Changed" }).where(eq(curriculumOutcomes.id, outcomeId)))).toMatch(/published/);
      expect(await rejectionMessage(db.update(curriculumVersions).set({ status: "published" }).where(eq(curriculumVersions.id, versionId)))).toMatch(/retired/);
    });
  });
});
