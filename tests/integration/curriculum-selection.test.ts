import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { importCurriculum } from "@/application/commands/import-curriculum";
import { publishCurriculumVersion } from "@/application/commands/publish-curriculum";
import { listSelectableTopics } from "@/application/queries/list-selectable-topics";
import type { Database } from "@/repositories/postgres/client";
import { getReadyDb } from "@/repositories/postgres/ready";
import { curriculumVersions } from "@/repositories/postgres/schema";
import { SelectableTopicsResponseSchema } from "@/schemas/curriculum-selection";
import { insertTestOutcomeTree, insertTestSource, insertTestVersion } from "../factories";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

// The route reads the signed-in parent through next/headers, which only exists inside a request.
const currentParent = vi.hoisted(() => ({ value: null as null | { parentProfileId: string; role: "parent" | "admin" } }));
vi.mock("@/application/queries/current-parent", () => ({
  getCurrentParent: async () => currentParent.value,
}));

const p3File = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../content/curriculum/p3-maths-moe-2025-10.json"), "utf8"),
) as Record<string, unknown>;

describe("listSelectableTopics", () => {
  let testDb: TestDatabase;
  let db: Database;
  const query = { subject: "Mathematics", level: "P3" };

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("returns null while nothing is published, even if a draft exists", async () => {
    await importCurriculum(p3File, { db });
    expect(await listSelectableTopics(query, { db })).toBeNull();
  });

  it("returns the published P3 topics in curriculum order with parent and child labels", async () => {
    const [draft] = await db.select().from(curriculumVersions);
    await publishCurriculumVersion(draft?.id ?? "", { profileId: null }, { db, allowUnverified: true, nodeEnv: "test", logger: { warn: () => undefined } });

    const result = await listSelectableTopics(query, { db });
    expect(result?.curriculumVersionId).toBe(draft?.id);
    expect(SelectableTopicsResponseSchema.safeParse(result).success).toBe(true);
    expect(result?.topics.map((topic) => topic.code)).toEqual([
      "P3-NA-WN",
      "P3-NA-AS",
      "P3-NA-MD",
      "P3-NA-FR",
      "P3-NA-MN",
      "P3-MG-LM",
      "P3-MG-TM",
      "P3-MG-AR",
      "P3-MG-AN",
      "P3-MG-PL",
      "P3-ST-BG",
    ]);
    const fractions = result?.topics.find((topic) => topic.code === "P3-NA-FR");
    expect(fractions?.label).toBe("Fractions");
    // Outcome order is the order in the source file (codes are stable but not always sequential).
    const fileFractions = (p3File.domains as { topics: { code: string; outcomes: { code: string }[] }[] }[])
      .flatMap((domain) => domain.topics)
      .find((topic) => topic.code === "P3-NA-FR");
    expect(fractions?.outcomes.map((outcome) => outcome.code)).toEqual(fileFractions?.outcomes.map((outcome) => outcome.code));
    expect(fractions?.outcomes).toHaveLength(5);
    const whole = result?.topics.find((topic) => topic.code === "P3-NA-WN");
    expect(whole?.label).toBe("Whole numbers to 10 000");
    expect(whole?.outcomes[0]).toMatchObject({ code: "P3-NA-WN-01", label: "Count in 100s and 1000s" });
  });

  it("exposes labels, codes and ids only: no statements, verification, sources or status", async () => {
    const result = await listSelectableTopics(query, { db });
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/verif|statement|source|status|scopeNotes|page/i);
    expect(Object.keys(result?.topics[0] ?? {}).sort()).toEqual(["code", "id", "label", "outcomes"]);
    expect(Object.keys(result?.topics[0]?.outcomes[0] ?? {}).sort()).toEqual(["code", "id", "label"]);
  });

  it("excludes a newer draft and keeps serving the published version", async () => {
    const source = await insertTestSource(db, "src-selection");
    const draft = await insertTestVersion(db, { code: "SEL-DRAFT", subjectName: "Mathematics", effectiveFrom: "2030-01-01" });
    await insertTestOutcomeTree(db, draft.id, source.id, "Z");
    const result = await listSelectableTopics(query, { db });
    expect(result?.topics.map((topic) => topic.code)).not.toContain("TZ");
    expect(result?.curriculumVersionId).not.toBe(draft.id);
    expect(result?.topics).toHaveLength(11);
  });

  it("serves the latest published version once a newer one is published, and ignores a retired one", async () => {
    const source = await insertTestSource(db, "src-selection-2");
    const newer = await insertTestVersion(db, { code: "SEL-NEWER", subjectName: "Mathematics", effectiveFrom: "2031-01-01" });
    await insertTestOutcomeTree(db, newer.id, source.id, "N");
    await publishCurriculumVersion(newer.id, { profileId: null }, { db, allowUnverified: true, nodeEnv: "test", logger: { warn: () => undefined } });

    const served = await listSelectableTopics(query, { db });
    expect(served?.curriculumVersionId).toBe(newer.id);
    expect(served?.topics.map((topic) => topic.code)).toEqual(["TN"]);

    await db.update(curriculumVersions).set({ status: "retired" }).where(eq(curriculumVersions.id, newer.id));
    const afterRetire = await listSelectableTopics(query, { db });
    expect(afterRetire?.curriculumVersionId).not.toBe(newer.id);
    expect(afterRetire?.topics).toHaveLength(11);
  });

  it("returns null for a subject or level with nothing published", async () => {
    expect(await listSelectableTopics({ subject: "Science", level: "P3" }, { db })).toBeNull();
    expect(await listSelectableTopics({ subject: "Mathematics", level: "P4" }, { db })).toBeNull();
  });
});

describe("GET /api/curriculum/topics", () => {
  const url = (search: string) => new Request(`http://localhost/api/curriculum/topics${search}`);

  beforeAll(async () => {
    // The route uses the shared in-memory database (migrated on first use).
    const db = await getReadyDb();
    await importCurriculum(p3File, { db });
    const [version] = await db.select().from(curriculumVersions).where(eq(curriculumVersions.code, "SG-MOE-PRI-MATH-2021-UPD-2025-10"));
    await publishCurriculumVersion(version?.id ?? "", { profileId: null }, { db, allowUnverified: true, nodeEnv: "test", logger: { warn: () => undefined } });
  });

  it("answers 401 when nobody is signed in, and returns no curriculum", async () => {
    const { GET } = await import("@/app/api/curriculum/topics/route");
    currentParent.value = null;
    const response = await GET(url("?subject=Mathematics&level=P3"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("returns the typed topics for a signed-in parent", async () => {
    const { GET } = await import("@/app/api/curriculum/topics/route");
    currentParent.value = { parentProfileId: "00000000-0000-4000-8000-000000000001", role: "parent" };
    const response = await GET(url("?subject=Mathematics&level=P3"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = SelectableTopicsResponseSchema.parse(await response.json());
    expect(body.topics).toHaveLength(11);
    expect(body.topics.find((topic) => topic.label === "Fractions")?.outcomes).toHaveLength(5);
  });

  it("answers 400 for a bad query and 404 when nothing is published for it", async () => {
    const { GET } = await import("@/app/api/curriculum/topics/route");
    currentParent.value = { parentProfileId: "00000000-0000-4000-8000-000000000001", role: "parent" };
    const bad = await GET(url("?subject=Mathematics&level=Primary3"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "invalid_query", issues: [{ field: "level" }] });
    expect((await GET(url(""))).status).toBe(400);
    expect((await GET(url("?subject=Science&level=P3"))).status).toBe(404);
  });
});
