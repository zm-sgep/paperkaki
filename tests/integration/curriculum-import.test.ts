import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { importCurriculum } from "@/application/commands/import-curriculum";
import { markOutcomeVerified } from "@/application/commands/curriculum-provenance";
import { getCurriculumTree } from "@/application/queries/curriculum";
import { CurriculumImportError, CurriculumVersionLockedError } from "@/domain/curriculum";
import type { Database } from "@/repositories/postgres/client";
import {
  auditLogs,
  curriculumDomains,
  curriculumOutcomeSources,
  curriculumOutcomes,
  curriculumTopics,
  curriculumVersions,
  outcomeRelationships,
  sourceDocuments,
  subjects,
} from "@/repositories/postgres/schema";
import { insertParentProfile } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

type Json = Record<string, unknown>;

const p3File = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../content/curriculum/p3-maths-moe-2025-10.json"), "utf8"),
) as Json;

function smallFile(): Json {
  return {
    curriculumVersion: { code: "IMPORT-V1", subject: "Test Subject", title: "Import test", levels: ["P3"] },
    sources: [{ id: "src-a", title: "Source A", publisher: "Test Publisher", provenance: "official_moe", verification: "unverified" }],
    domains: [
      {
        code: "D1",
        title: "Domain one",
        topics: [
          {
            code: "T1",
            title: "Topic one",
            parentLabel: "Topic one for parents",
            notes: ['Scope limit: "up to 4 digits"'],
            outcomes: [
              { code: "O1", statement: "first", childLabel: "First", sourceRef: { sourceId: "src-a", pageOrSection: "p. 1" } },
              { code: "O2", statement: "second", childLabel: "Second", sourceRef: { sourceId: "src-a", pageOrSection: "p. 2" } },
              { code: "O3", statement: "third", childLabel: "Third", sourceRef: { sourceId: "src-a", pageOrSection: "p. 3" } },
            ],
          },
        ],
      },
    ],
    relationships: [{ from: "O1", to: "O2", kind: "progression" }],
  };
}

function edited(change: (file: Json & { domains: { topics: { outcomes: Json[]; notes?: string[] }[] }[] }) => void): Json {
  const file = structuredClone(smallFile()) as Json & { domains: { topics: { outcomes: Json[]; notes?: string[] }[] }[] };
  change(file);
  return file;
}

async function rowCounts(db: Database) {
  const count1 = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0]?.n ?? 0;
  return {
    subjects: await count1(subjects),
    versions: await count1(curriculumVersions),
    sources: await count1(sourceDocuments),
    domains: await count1(curriculumDomains),
    topics: await count1(curriculumTopics),
    outcomes: await count1(curriculumOutcomes),
    links: await count1(curriculumOutcomeSources),
    relationships: await count1(outcomeRelationships),
    audit: await count1(auditLogs),
  };
}

describe("importCurriculum", () => {
  let testDb: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("imports the P3 Mathematics file: 38 outcomes, all sourced, all unverified, draft", async () => {
    const summary = await importCurriculum(p3File, { db });
    expect(summary).toMatchObject({ versionCreated: true, changed: true });
    expect(summary.outcomes.created).toBe(38);
    expect(summary.topics.created).toBe(11);
    expect(summary.domains.created).toBe(3);

    const [version] = await db.select().from(curriculumVersions).where(eq(curriculumVersions.id, summary.versionId));
    expect(version).toMatchObject({ code: "SG-MOE-PRI-MATH-2021-UPD-2025-10", status: "draft", levels: ["P3"], effectiveFrom: "2025-10-01" });

    const outcomes = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.curriculumVersionId, summary.versionId));
    expect(outcomes).toHaveLength(38);
    expect(outcomes.every((outcome) => outcome.verification === "unverified" && outcome.level === "P3")).toBe(true);
    const links = await db.select().from(curriculumOutcomeSources);
    expect(links).toHaveLength(38);
    expect(links.every((link) => (link.pageOrSection ?? "").startsWith("p. 3"))).toBe(true);

    const tree = await getCurriculumTree(summary.versionId, { audience: "admin" }, { db });
    const fractions = tree?.domains.flatMap((domain) => domain.topics).find((topic) => topic.code === "P3-NA-FR");
    expect(fractions?.parentLabel).toBeTruthy();
    expect(fractions?.scopeNotes.length).toBeGreaterThan(0);
  });

  it("is idempotent: a second import of the same file changes nothing", async () => {
    const before = await rowCounts(db);
    const again = await importCurriculum(p3File, { db });
    expect(again.changed).toBe(false);
    expect(again.versionCreated).toBe(false);
    expect(await rowCounts(db)).toEqual(before);
  });

  it("records one audit event per import that changed something, and none for a no-op", async () => {
    const events = await db.select().from(auditLogs).where(eq(auditLogs.action, "curriculum.imported"));
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({ versionCode: "SG-MOE-PRI-MATH-2021-UPD-2025-10", versionCreated: true });
  });

  describe("draft versions", () => {
    it("updates text by code when the same draft is imported again, keeping row ids", async () => {
      const first = await importCurriculum(smallFile(), { db });
      const [before] = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.code, "O2"));

      const second = await importCurriculum(
        edited((file) => {
          const topic = file.domains[0]?.topics[0];
          if (!topic) return;
          (topic.outcomes[1] as Json).statement = "second, reworded";
          (topic.outcomes[1] as Json).childLabel = "Second (new label)";
          topic.notes = ["A new scope note"];
        }),
        { db },
      );
      expect(second.versionId).toBe(first.versionId);
      expect(second.changed).toBe(true);
      expect(second.outcomes).toEqual({ created: 0, updated: 1, removed: 0 });
      expect(second.topics.updated).toBe(1);

      const [after] = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.code, "O2"));
      expect(after).toMatchObject({ id: before?.id, statement: "second, reworded", childLabel: "Second (new label)" });
      const [topic] = await db.select().from(curriculumTopics).where(eq(curriculumTopics.code, "T1"));
      expect(topic?.scopeNotes).toEqual(["A new scope note"]);
    });

    it("resets verification only when the outcome's wording changed", async () => {
      const admin = await insertParentProfile(db, "I", { role: "admin" });
      const [version] = await db.select().from(curriculumVersions).where(eq(curriculumVersions.code, "IMPORT-V1"));
      const outcomes = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.curriculumVersionId, version?.id ?? ""));
      const o1 = outcomes.find((outcome) => outcome.code === "O1");
      const o3 = outcomes.find((outcome) => outcome.code === "O3");
      for (const outcome of [o1, o3]) {
        await markOutcomeVerified({ versionId: version?.id ?? "", outcomeId: outcome?.id ?? "", verifierProfileId: admin.id }, { db });
      }

      // Same wording for O1 (only its label changes); new wording for O3.
      const summary = await importCurriculum(
        edited((file) => {
          const topic = file.domains[0]?.topics[0];
          if (!topic) return;
          topic.notes = ["A new scope note"];
          (topic.outcomes[0] as Json).childLabel = "First, friendlier";
          (topic.outcomes[1] as Json).statement = "second, reworded";
          (topic.outcomes[1] as Json).childLabel = "Second (new label)";
          (topic.outcomes[2] as Json).statement = "third, reworded";
        }),
        { db },
      );
      expect(summary.verificationReset).toBe(1);
      const after = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.curriculumVersionId, version?.id ?? ""));
      expect(after.find((outcome) => outcome.code === "O1")).toMatchObject({ verification: "verified", verifiedBy: admin.id });
      expect(after.find((outcome) => outcome.code === "O3")).toMatchObject({ verification: "unverified", verifiedBy: null, verifiedAt: null });
    });

    it("removes rows the file no longer lists, with their source links and relationships", async () => {
      const summary = await importCurriculum(
        edited((file) => {
          const topic = file.domains[0]?.topics[0];
          if (!topic) return;
          topic.notes = ["A new scope note"];
          (topic.outcomes[1] as Json).statement = "second, reworded";
          (topic.outcomes[1] as Json).childLabel = "Second (new label)";
          (topic.outcomes[2] as Json).statement = "third, reworded";
          (topic.outcomes[0] as Json).childLabel = "First, friendlier";
          topic.outcomes.splice(1, 1); // drop O2, which O1 relates to
          delete file.relationships;
        }),
        { db },
      );
      expect(summary.outcomes.removed).toBe(1);
      expect(summary.sourceLinks.removed).toBe(1);
      const codes = (await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.curriculumVersionId, summary.versionId))).map((row) => row.code).sort();
      expect(codes).toEqual(["O1", "O3"]);
      const relationships = await db.select().from(outcomeRelationships);
      expect(relationships).toHaveLength(0);
    });

    it("moves a source link when its page changes, without keeping the old one", async () => {
      const summary = await importCurriculum(
        edited((file) => {
          const topic = file.domains[0]?.topics[0];
          if (!topic) return;
          topic.notes = ["A new scope note"];
          (topic.outcomes[0] as Json).childLabel = "First, friendlier";
          (topic.outcomes[0] as Json).sourceRef = { sourceId: "src-a", pageOrSection: "p. 10" };
          (topic.outcomes[2] as Json).statement = "third, reworded";
          topic.outcomes.splice(1, 1);
          delete file.relationships;
        }),
        { db },
      );
      expect(summary.sourceLinks).toEqual({ created: 1, updated: 0, removed: 1 });
      const [o1] = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.code, "O1"));
      const links = await db.select().from(curriculumOutcomeSources).where(eq(curriculumOutcomeSources.outcomeId, o1?.id ?? ""));
      expect(links.map((link) => link.pageOrSection)).toEqual(["p. 10"]);
    });
  });

  describe("failures", () => {
    it("refuses to import into a published version, with a clear message, and changes nothing", async () => {
      await importCurriculum(smallFile(), { db }); // brings IMPORT-V1 back to the file's content
      await db.update(curriculumVersions).set({ status: "published", publishedAt: new Date() }).where(eq(curriculumVersions.code, "IMPORT-V1"));
      const before = await rowCounts(db);
      const error = await importCurriculum(
        edited((file) => {
          (file.domains[0]?.topics[0]?.outcomes[0] as Json).statement = "changed after publishing";
        }),
        { db },
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(CurriculumVersionLockedError);
      expect((error as Error).message).toMatch(/IMPORT-V1 is published and cannot be changed.*new version/);
      expect(await rowCounts(db)).toEqual(before);
    });

    it("refuses an unknown source id before writing anything", async () => {
      const before = await rowCounts(db);
      const file = structuredClone(smallFile()) as Json & { curriculumVersion: Json; domains: { topics: { outcomes: Json[] }[] }[] };
      file.curriculumVersion.code = "IMPORT-BAD";
      (file.domains[0]?.topics[0]?.outcomes[0] as Json).sourceRef = { sourceId: "src-missing", pageOrSection: "p. 1" };
      const error = await importCurriculum(file, { db }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(CurriculumImportError);
      expect((error as Error).message).toContain("domains[0].topics[0].outcomes[0].sourceRef.sourceId: unknown source id src-missing");
      expect(await rowCounts(db)).toEqual(before);
    });

    it("rolls the whole import back when a write fails part-way", async () => {
      const file = structuredClone(smallFile()) as Json & { curriculumVersion: Json };
      file.curriculumVersion.code = "IMPORT-ROLLBACK";
      // The same source code is fine, but a version code that already exists as a PUBLISHED
      // version is not: use a fresh file whose relationship points at a real code, then break
      // the audit step by using an actor that does not exist.
      const before = await rowCounts(db);
      await expect(importCurriculum(file, { db, actorProfileId: "00000000-0000-4000-8000-00000000dead" })).rejects.toThrow();
      expect(await rowCounts(db)).toEqual(before);
    });
  });
});
