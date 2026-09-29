import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { markOutcomeVerified } from "@/application/commands/curriculum-provenance";
import { importCurriculum } from "@/application/commands/import-curriculum";
import { publishCurriculumVersion } from "@/application/commands/publish-curriculum";
import { SeedRefusedError, seedDevelopmentCurriculum } from "@/application/commands/seed-dev-curriculum";
import { getCurriculumVersionForLevel } from "@/application/queries/curriculum";
import { CurriculumPublishRefusedError, CurriculumVersionLockedError } from "@/domain/curriculum";
import type { Database } from "@/repositories/postgres/client";
import {
  auditLogs,
  curriculumOutcomeSources,
  curriculumOutcomes,
  curriculumVersions,
  type CurriculumVersion,
} from "@/repositories/postgres/schema";
import { insertParentProfile, insertTestOutcomeTree, insertTestSource, insertTestVersion } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const p3File = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../content/curriculum/p3-maths-moe-2025-10.json"), "utf8"),
) as unknown;

describe("publishCurriculumVersion", () => {
  let testDb: TestDatabase;
  let db: Database;
  let adminId: string;
  const warnings: { fields: Record<string, unknown>; message: string }[] = [];
  const logger = { warn: (fields: Record<string, unknown>, message: string) => warnings.push({ fields, message }) };

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    adminId = (await insertParentProfile(db, "Q", { role: "admin" })).id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  async function draftWithOutcomes(code: string, outcomeCount = 2) {
    const source = await insertTestSource(db, `src-${code}`);
    const version = await insertTestVersion(db, { code });
    const outcomes = [];
    for (let index = 1; index <= outcomeCount; index += 1) {
      outcomes.push((await insertTestOutcomeTree(db, version.id, source.id, `${code}-${index}`)).outcome);
    }
    return { version, outcomes };
  }

  async function statusOf(version: CurriculumVersion) {
    const [row] = await db.select().from(curriculumVersions).where(eq(curriculumVersions.id, version.id));
    return row;
  }

  it("refuses an outcome with no source link and leaves the version a draft", async () => {
    const { version, outcomes } = await draftWithOutcomes("PUB-NOSRC");
    await db.delete(curriculumOutcomeSources).where(eq(curriculumOutcomeSources.outcomeId, outcomes[1]?.id ?? ""));
    const error = await publishCurriculumVersion(version.id, { profileId: adminId }, { db, allowUnverified: true, nodeEnv: "development", logger }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(CurriculumPublishRefusedError);
    expect(error).toMatchObject({ reason: "outcomes_without_source", codes: ["OPUB-NOSRC-2"] });
    expect((await statusOf(version))?.status).toBe("draft");
  });

  it("refuses unverified outcomes without the flag", async () => {
    const { version } = await draftWithOutcomes("PUB-NOFLAG");
    await expect(publishCurriculumVersion(version.id, { profileId: adminId }, { db, nodeEnv: "development", logger })).rejects.toMatchObject({
      reason: "unverified_outcomes",
      count: 2,
    });
    expect((await statusOf(version))?.status).toBe("draft");
  });

  it("refuses unverified outcomes in production even with allowUnverified", async () => {
    const { version } = await draftWithOutcomes("PUB-PROD");
    await expect(
      publishCurriculumVersion(version.id, { profileId: adminId }, { db, allowUnverified: true, nodeEnv: "production", logger }),
    ).rejects.toMatchObject({ reason: "unverified_in_production" });
    expect((await statusOf(version))?.status).toBe("draft");
  });

  it("publishes with allowUnverified in development, logs a warning naming the count, and audits it", async () => {
    warnings.length = 0;
    const { version } = await draftWithOutcomes("PUB-DEV");
    const now = new Date("2026-09-30T02:00:00Z");
    const result = await publishCurriculumVersion(
      version.id,
      { profileId: adminId },
      { db, allowUnverified: true, nodeEnv: "development", logger, now, requestId: "req-publish-0001" },
    );
    expect(result).toMatchObject({ versionCode: "PUB-DEV", outcomeCount: 2, unverifiedCount: 2 });

    const row = await statusOf(version);
    expect(row).toMatchObject({ status: "published", publishedBy: adminId });
    expect(row?.publishedAt?.toISOString()).toBe(now.toISOString());

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/2 unverified outcome/);
    expect(warnings[0]?.fields).toMatchObject({ unverifiedCount: 2, versionCode: "PUB-DEV" });

    const [event] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, version.id), eq(auditLogs.action, "curriculum.published")));
    expect(event).toMatchObject({
      actorProfileId: adminId,
      requestId: "req-publish-0001",
      metadata: { versionCode: "PUB-DEV", outcomeCount: 2, unverifiedCount: 2 },
    });
  });

  it("publishes fully verified curriculum in production without a warning", async () => {
    warnings.length = 0;
    const { version, outcomes } = await draftWithOutcomes("PUB-VERIFIED");
    for (const outcome of outcomes) {
      await markOutcomeVerified({ versionId: version.id, outcomeId: outcome.id, verifierProfileId: adminId }, { db });
    }
    const result = await publishCurriculumVersion(version.id, { profileId: adminId }, { db, nodeEnv: "production", logger });
    expect(result.unverifiedCount).toBe(0);
    expect(warnings).toHaveLength(0);
    expect((await statusOf(version))?.status).toBe("published");
  });

  it("publishing freezes the version: a second publish and later edits are refused", async () => {
    const { version, outcomes } = await draftWithOutcomes("PUB-FREEZE", 1);
    await publishCurriculumVersion(version.id, { profileId: adminId }, { db, allowUnverified: true, nodeEnv: "test", logger });
    await expect(
      publishCurriculumVersion(version.id, { profileId: adminId }, { db, allowUnverified: true, nodeEnv: "test", logger }),
    ).rejects.toBeInstanceOf(CurriculumVersionLockedError);
    await expect(
      db.update(curriculumOutcomes).set({ statement: "changed" }).where(eq(curriculumOutcomes.id, outcomes[0]?.id ?? "")),
    ).rejects.toThrow();
  });

  it("refuses a version with no outcomes", async () => {
    const version = await insertTestVersion(db, { code: "PUB-EMPTY" });
    await expect(publishCurriculumVersion(version.id, { profileId: adminId }, { db, allowUnverified: true, nodeEnv: "test", logger })).rejects.toMatchObject({
      reason: "no_outcomes",
    });
  });

  it("reports a missing version", async () => {
    await expect(
      publishCurriculumVersion("00000000-0000-4000-8000-000000000000", { profileId: adminId }, { db, allowUnverified: true, nodeEnv: "test", logger }),
    ).rejects.toThrow(/not found/);
  });
});

describe("seedDevelopmentCurriculum", () => {
  let testDb: TestDatabase;
  let db: Database;
  const silent = { warn: () => undefined };

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("refuses to run in production and writes nothing", async () => {
    await expect(seedDevelopmentCurriculum(p3File, { db, nodeEnv: "production", logger: silent })).rejects.toBeInstanceOf(SeedRefusedError);
    expect(await getCurriculumVersionForLevel({ subject: "Mathematics", level: "P3", audience: "admin" }, { db })).toBeNull();
  });

  it("imports and publishes the P3 curriculum in development", async () => {
    const result = await seedDevelopmentCurriculum(p3File, { db, nodeEnv: "development", logger: silent });
    expect(result).toEqual({
      status: "seeded",
      versionCode: "SG-MOE-PRI-MATH-2021-UPD-2025-10",
      outcomeCount: 38,
      unverifiedCount: 38,
    });
    const version = await getCurriculumVersionForLevel({ subject: "Mathematics", level: "P3", audience: "public" }, { db });
    expect(version).toMatchObject({ status: "published", code: "SG-MOE-PRI-MATH-2021-UPD-2025-10" });
  });

  it("is idempotent: running it again changes nothing", async () => {
    const auditBefore = (await db.select().from(auditLogs)).length;
    const again = await seedDevelopmentCurriculum(p3File, { db, nodeEnv: "development", logger: silent });
    expect(again).toEqual({ status: "already-published", versionCode: "SG-MOE-PRI-MATH-2021-UPD-2025-10" });
    expect((await db.select().from(auditLogs)).length).toBe(auditBefore);
  });

  it("importing the seeded file again is refused because the version is published", async () => {
    await expect(importCurriculum(p3File, { db })).rejects.toBeInstanceOf(CurriculumVersionLockedError);
  });
});
