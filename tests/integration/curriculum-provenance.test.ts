import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { linkOutcomeSource, markOutcomeVerified, registerSource } from "@/application/commands/curriculum-provenance";
import { getOutcomeWithSources } from "@/application/queries/curriculum";
import { CurriculumProvenanceError, CurriculumVersionLockedError } from "@/domain/curriculum";
import type { Database } from "@/repositories/postgres/client";
import { linkOutcomeToSource } from "@/repositories/postgres/curriculum-write";
import {
  auditLogs,
  curriculumOutcomeSources,
  curriculumOutcomes,
  curriculumVersions,
  sourceDocuments,
} from "@/repositories/postgres/schema";
import { insertParentProfile, insertTestOutcomeTree, insertTestSource, insertTestVersion } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

describe("provenance workflow", () => {
  let testDb: TestDatabase;
  let db: Database;
  let adminId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    adminId = (await insertParentProfile(db, "P", { role: "admin" })).id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  async function newOutcome(code: string, page: string | null = "p. 1") {
    const source = await insertTestSource(db, `src-${code}`);
    const version = await insertTestVersion(db, { code: `PROV-${code}` });
    const tree = await insertTestOutcomeTree(db, version.id, source.id, code);
    if (page === null) {
      await db.delete(curriculumOutcomeSources).where(eq(curriculumOutcomeSources.outcomeId, tree.outcome.id));
      await db.insert(curriculumOutcomeSources).values({ outcomeId: tree.outcome.id, sourceId: source.id, pageOrSection: null });
    }
    return { source, version, ...tree };
  }

  async function auditActions(entityId: string) {
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityId, entityId));
    return rows.map((row) => row.action);
  }

  it("registers a source with an audit event and rejects a duplicate code", async () => {
    const source = await registerSource(
      {
        code: "src-registered",
        title: "Test syllabus",
        publisher: "Test Publisher",
        url: "https://example.test/syllabus.pdf",
        provenance: "official_moe",
        accessedOn: "2026-09-29",
      },
      adminId,
      { db, requestId: "req-source-0001" },
    );
    expect(source).toMatchObject({ code: "src-registered", verification: "unverified", url: "https://example.test/syllabus.pdf" });
    const events = await db.select().from(auditLogs).where(eq(auditLogs.entityId, source.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "curriculum.source_registered",
      actorProfileId: adminId,
      requestId: "req-source-0001",
      metadata: { sourceCode: "src-registered", provenance: "official_moe" },
    });
    await expect(
      registerSource({ code: "src-registered", title: "Again", publisher: "P", provenance: "official_moe" }, adminId, { db }),
    ).rejects.toThrow(/already registered/);
  });

  it("accepts a source without a URL and refuses a non-http URL", async () => {
    const source = await registerSource(
      { code: "src-no-url", title: "Notes from a school", publisher: "Test School", provenance: "official_school" },
      adminId,
      { db },
    );
    expect(source.url).toBeNull();
    await expect(
      registerSource({ code: "src-bad-url", title: "Bad", publisher: "P", url: "file:///etc/passwd", provenance: "official_moe" }, adminId, { db }),
    ).rejects.toThrow();
  });

  it("links an outcome to a source with a page, audits it, and does not duplicate the link", async () => {
    const { version, outcome } = await newOutcome("LINK");
    const extra = await insertTestSource(db, "src-extra");
    const first = await linkOutcomeSource(
      { versionId: version.id, outcomeId: outcome.id, sourceId: extra.id, pageOrSection: " Section 4 " },
      adminId,
      { db },
    );
    const again = await linkOutcomeSource(
      { versionId: version.id, outcomeId: outcome.id, sourceId: extra.id, pageOrSection: "Section 4" },
      adminId,
      { db },
    );
    expect(first.created).toBe(true);
    expect(again).toEqual({ linkId: first.linkId, created: false });

    const detail = await getOutcomeWithSources(version.id, outcome.id, { audience: "admin" }, { db });
    expect(detail?.sources.map((source) => source.pageOrSection).sort()).toEqual(["Section 4", "p. 1"]);
    expect((await auditActions(outcome.id)).filter((action) => action === "curriculum.outcome_source_linked")).toHaveLength(1);
  });

  it("refuses to link an outcome from another version or an unknown source", async () => {
    const one = await newOutcome("SCOPE1");
    const two = await newOutcome("SCOPE2");
    await expect(
      linkOutcomeSource({ versionId: two.version.id, outcomeId: one.outcome.id, sourceId: one.source.id }, adminId, { db }),
    ).rejects.toThrow(/not found/);
    await expect(
      linkOutcomeSource({ versionId: one.version.id, outcomeId: one.outcome.id, sourceId: "00000000-0000-4000-8000-000000000000" }, adminId, { db }),
    ).rejects.toThrow(/not found/);
  });

  it("marks an outcome verified with a named verifier, a timestamp and an audit event", async () => {
    const { version, outcome } = await newOutcome("OK");
    const now = new Date("2026-09-30T01:02:03Z");
    const result = await markOutcomeVerified(
      { versionId: version.id, outcomeId: outcome.id, verifierProfileId: adminId },
      { db, now, requestId: "req-verify-0001" },
    );
    expect(result).toEqual({ outcomeCode: "OOK", alreadyVerified: false });
    const [row] = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.id, outcome.id));
    expect(row).toMatchObject({ verification: "verified", verifiedBy: adminId });
    expect(row?.verifiedAt?.toISOString()).toBe(now.toISOString());
    const [event] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, outcome.id), eq(auditLogs.action, "curriculum.outcome_verified")));
    expect(event).toMatchObject({ actorProfileId: adminId, requestId: "req-verify-0001", metadata: { outcomeCode: "OOK", sourceLinkCount: 1 } });
  });

  it("refuses to verify without a verifier profile id, and changes nothing", async () => {
    const { version, outcome } = await newOutcome("NOVER");
    await expect(markOutcomeVerified({ versionId: version.id, outcomeId: outcome.id, verifierProfileId: null }, { db })).rejects.toMatchObject({
      reason: "missing_verifier",
    });
    const [row] = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.id, outcome.id));
    expect(row?.verification).toBe("unverified");
    expect(await auditActions(outcome.id)).not.toContain("curriculum.outcome_verified");
  });

  it("refuses to verify while no source link has a page or section", async () => {
    const { version, outcome } = await newOutcome("NOPAGE", null);
    const error = await markOutcomeVerified({ versionId: version.id, outcomeId: outcome.id, verifierProfileId: adminId }, { db }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(CurriculumProvenanceError);
    expect(error).toMatchObject({ reason: "no_page_reference" });
    const [row] = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.id, outcome.id));
    expect(row?.verification).toBe("unverified");
  });

  it("records a page typed by the verifier on the pageless link, then verifies", async () => {
    const { version, outcome } = await newOutcome("ASK", null);
    await markOutcomeVerified(
      { versionId: version.id, outcomeId: outcome.id, verifierProfileId: adminId, pageOrSection: "p. 35, 1.2" },
      { db },
    );
    const detail = await getOutcomeWithSources(version.id, outcome.id, { audience: "admin" }, { db });
    expect(detail?.verification).toBe("verified");
    expect(detail?.sources.map((source) => source.pageOrSection)).toEqual(["p. 35, 1.2"]);
  });

  it("does not record a typed page when the verifier is missing", async () => {
    const { version, outcome } = await newOutcome("ASK2", null);
    await expect(
      markOutcomeVerified({ versionId: version.id, outcomeId: outcome.id, verifierProfileId: null, pageOrSection: "p. 1" }, { db }),
    ).rejects.toMatchObject({ reason: "missing_verifier" });
    const detail = await getOutcomeWithSources(version.id, outcome.id, { audience: "admin" }, { db });
    expect(detail?.sources.map((source) => source.pageOrSection)).toEqual([null]);
  });

  it("refuses an outcome that is not in the given version", async () => {
    const one = await newOutcome("FOREIGN1");
    const two = await newOutcome("FOREIGN2");
    await expect(
      markOutcomeVerified({ versionId: two.version.id, outcomeId: one.outcome.id, verifierProfileId: adminId }, { db }),
    ).rejects.toThrow(/not found/);
  });

  it("refuses provenance changes on a published version, through the repository", async () => {
    const { source, version, outcome } = await newOutcome("LOCKED");
    await db.update(curriculumVersions).set({ status: "published", publishedAt: new Date() }).where(eq(curriculumVersions.id, version.id));
    await expect(
      markOutcomeVerified({ versionId: version.id, outcomeId: outcome.id, verifierProfileId: adminId }, { db }),
    ).rejects.toBeInstanceOf(CurriculumVersionLockedError);
    await expect(
      linkOutcomeToSource(db, { versionId: version.id, outcomeId: outcome.id, sourceId: source.id, pageOrSection: "p. 9" }),
    ).rejects.toBeInstanceOf(CurriculumVersionLockedError);
    expect((await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, source.id))).length).toBe(1);
  });
});
