import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { archiveChild, createChild, selectChild, updateChild } from "@/application/commands/children";
import {
  confirmScope,
  createAssessment,
  setAssessmentScope,
  setPaperSettings,
  useRecommendedSettings,
} from "@/application/commands/assessments";
import { InputError, NotFoundError } from "@/application/errors";
import { getParentChildren } from "@/application/queries/children";
import { getAssessmentSetup, getPrepareOverview, getScopeSetup } from "@/application/queries/assessment-setup";
import { getParentHome, getParentHomeState } from "@/application/queries/parent-home";
import { nextParentAction } from "@/domain/recommendations/next-parent-action";
import type { Database } from "@/repositories/postgres/client";
import {
  assessmentBlueprints,
  assessmentRequirements,
  assessmentScopeItems,
  auditLogs,
  children as childrenTable,
  curriculumOutcomes,
} from "@/repositories/postgres/schema";
import { insertParentProfile, insertTestOutcomeTree, insertTestSource, insertTestVersion } from "../factories";
import { seedRealBank } from "../helpers/seed-bank";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

// Fixed "now" (Singapore date 2026-09-29) so date rules do not depend on the day the tests run.
const NOW = new Date("2026-09-29T02:00:00Z");
const DATE_OK = "2026-10-14";

describe("assessment setup (M3)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let parentA: string;
  let parentB: string;
  let topicIdsByLabel: Map<string, string>;
  let topicsWithoutQuestions: string[] = [];

  const ctx = () => ({ db, now: NOW });
  /** The topic id whose parent label starts with `prefix` ("Time" -> "Time and how long things take"). */
  const topicId = (prefix: string): string => {
    for (const [label, id] of topicIdsByLabel) if (label.startsWith(prefix)) return id;
    throw new Error(`no topic starting with ${prefix}`);
  };

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

  async function newAssessment(parent: string, childId: string | undefined, nickname = "Test Child A") {
    return createAssessment(
      parent,
      childId ? { childId, type: "wa2", date: DATE_OK } : { newChildNickname: nickname, type: "wa2", date: DATE_OK },
      ctx(),
    );
  }

  async function topics(parent: string, assessmentId: string) {
    const setup = await getScopeSetup(parent, assessmentId, ctx());
    if (!setup) throw new Error("no scope setup");
    topicIdsByLabel = new Map(setup.topics.map((t) => [t.label, t.id]));
    topicsWithoutQuestions = setup.topics.filter((t) => !t.hasQuestions).map((t) => t.label);
    return setup;
  }

  describe("home state -> next action", () => {
    it("no child -> add child", async () => {
      const action = (await getParentHome(parentA, ctx())).action;
      expect(action.kind).toBe("add_child");
      expect((await getParentHome(parentA, ctx())).contextLine).toBeNull();
    });

    it("child without an assessment -> add assessment", async () => {
      const child = await createChild(parentA, { nickname: "Test Child A" }, ctx());
      const state = await getParentHomeState(parentA, ctx());
      expect(state.selectedChildId).toBe(child.id);
      expect(nextParentAction(state).kind).toBe("add_assessment");
    });

    it("draft assessment -> confirm scope; confirmed -> generate mock", async () => {
      const [child] = (await getParentChildren(parentA, { db })).children;
      const assessment = await newAssessment(parentA, child?.id);
      expect(assessment.name).toBe("WA2");
      const draft = await getParentHome(parentA, ctx());
      expect(draft.action).toMatchObject({ kind: "confirm_scope", href: `/prepare/${assessment.id}/scope` });
      expect(draft.contextLine).toBe("Next: WA2 · Wed 14 Oct (in 15 days)");

      const setup = await topics(parentA, assessment.id);
      await setAssessmentScope(parentA, assessment.id, [setup.topics[0]!.id, setup.topics[1]!.id], ctx());
      await confirmScope(parentA, assessment.id, ctx());
      const confirmed = await getParentHome(parentA, ctx());
      expect(confirmed.action).toMatchObject({ kind: "generate_mock", ctaLabel: "Generate first mock" });
    });
  });

  describe("children", () => {
    it("creates, renames and archives only the parent's own children", async () => {
      const child = await createChild(parentB, { nickname: "  Test   Child B " }, ctx());
      expect(child.nickname).toBe("Test Child B");
      expect(child.level).toBe("P3");
      expect(child.academicYear).toBe(2026);
      const renamed = await updateChild(parentB, child.id, { nickname: "Test Child B2", schoolName: " Test School " }, ctx());
      expect(renamed).toMatchObject({ nickname: "Test Child B2", schoolName: "Test School" });
      await archiveChild(parentB, child.id, ctx());
      expect((await getParentChildren(parentB, { db })).children).toEqual([]);
      const [row] = await db.select().from(childrenTable).where(eq(childrenTable.id, child.id));
      expect(row?.archivedAt).not.toBeNull();
    });

    it("validates the nickname and level", async () => {
      await expect(createChild(parentB, { nickname: "   " }, ctx())).rejects.toBeInstanceOf(InputError);
      await expect(createChild(parentB, { nickname: "x".repeat(31) }, ctx())).rejects.toBeInstanceOf(InputError);
      await expect(createChild(parentB, { nickname: "Ok", level: "P4" as "P3" }, ctx())).rejects.toBeInstanceOf(InputError);
    });

    it("selectChild remembers the choice and clears it when that child is archived", async () => {
      const first = await createChild(parentB, { nickname: "Test Child B3" }, ctx());
      const second = await createChild(parentB, { nickname: "Test Child B4" }, ctx());
      expect((await getParentChildren(parentB, { db })).selectedChildId).toBe(first.id);
      await selectChild(parentB, second.id, ctx());
      expect((await getParentChildren(parentB, { db })).selectedChildId).toBe(second.id);
      await archiveChild(parentB, second.id, ctx());
      expect((await getParentChildren(parentB, { db })).selectedChildId).toBe(first.id);
    });

    it("stores no personal fields beyond nickname, level, school and year", async () => {
      const columns = Object.keys(childrenTable).filter((key) => !key.startsWith("_") && key !== "enableRLS");
      expect(columns.sort()).toEqual(
        ["academicYear", "archivedAt", "createdAt", "id", "level", "nickname", "parentProfileId", "schoolName"].sort(),
      );
    });
  });

  describe("createAssessment", () => {
    it("validates type, name for Other, and dates in Singapore time", async () => {
      const [child] = (await getParentChildren(parentA, { db })).children;
      const attempt = (over: Record<string, string>) =>
        createAssessment(parentA, { childId: child!.id, type: "wa1", date: DATE_OK, ...over }, ctx());
      await expect(attempt({ type: "nope" })).rejects.toMatchObject({ fieldErrors: { type: expect.any(String) } });
      await expect(attempt({ type: "other", customName: " " })).rejects.toMatchObject({ fieldErrors: { customName: expect.any(String) } });
      await expect(attempt({ date: "2026-09-28" })).rejects.toMatchObject({ fieldErrors: { date: "Choose today or a later date." } });
      await expect(attempt({ date: "" })).rejects.toMatchObject({ fieldErrors: { date: expect.any(String) } });
      // 2026-09-29 02:00 UTC is 10:00 in Singapore: today is allowed.
      await expect(attempt({ date: "2026-09-29" })).resolves.toMatchObject({ date: "2026-09-29" });
      const other = await attempt({ type: "other", customName: "  Topic   test " });
      expect(other.name).toBe("Topic test");
    });

    it("creates the first child in the same step, or none at all when it fails", async () => {
      const parentC = (await insertParentProfile(db, "C")).id;
      await expect(
        createAssessment(parentC, { newChildNickname: "Test Child C", type: "wa1", date: "2020-01-01" }, ctx()),
      ).rejects.toBeInstanceOf(InputError);
      expect((await getParentChildren(parentC, { db })).children).toEqual([]);
      const assessment = await createAssessment(parentC, { newChildNickname: "Test Child C", type: "wa1", date: DATE_OK }, ctx());
      const { children, selectedChildId } = await getParentChildren(parentC, { db });
      expect(children).toHaveLength(1);
      expect(selectedChildId).toBe(assessment.childId);
    });

    it("records a curriculum version and audit events without personal content", async () => {
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.actorProfileId, parentA));
      const actions = logs.map((log) => log.action);
      expect(actions).toContain("child.created");
      expect(actions).toContain("assessment.created");
      expect(actions).toContain("assessment.scope_confirmed");
      expect(JSON.stringify(logs.map((l) => l.metadata))).not.toMatch(/Test Child/);
    });
  });

  describe("scope", () => {
    let assessmentId: string;

    beforeAll(async () => {
      const [child] = (await getParentChildren(parentA, { db })).children;
      assessmentId = (await newAssessment(parentA, child!.id)).id;
    });

    it("stores every outcome of each chosen topic and shows the checklist in parent words", async () => {
      const setup = await topics(parentA, assessmentId);
      expect(setup.topics.length).toBeGreaterThanOrEqual(9);
      expect(setup.topics.every((t) => t.label.length > 0 && !/^P3-/.test(t.label))).toBe(true);
      const fractions = topicId("Fractions");
      await setAssessmentScope(parentA, assessmentId, [fractions, fractions], ctx());
      const rows = await db.select().from(assessmentScopeItems).where(eq(assessmentScopeItems.assessmentId, assessmentId));
      const outcomes = await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.topicId, fractions));
      expect(rows.map((r) => r.outcomeId).sort()).toEqual(outcomes.map((o) => o.id).sort());
      const again = await getScopeSetup(parentA, assessmentId, ctx());
      expect(again?.topics.filter((t) => t.selected).map((t) => t.label)).toEqual(["Fractions"]);
    });

    it("rejects topics that are not in the assessment's curriculum version, and empty scope", async () => {
      await expect(setAssessmentScope(parentA, assessmentId, [], ctx())).rejects.toBeInstanceOf(InputError);
      await expect(
        setAssessmentScope(parentA, assessmentId, ["00000000-0000-4000-8000-00000000dead"], ctx()),
      ).rejects.toMatchObject({ fieldErrors: { topics: expect.any(String) } });
    });

    it("rejects a topic from a different curriculum version", async () => {
      const source = await insertTestSource(db, "src-other-version");
      const other = await insertTestVersion(db, { code: "OTHER-V1", subjectName: "Other Subject" });
      const { topic } = await insertTestOutcomeTree(db, other.id, source.id, "x");
      await expect(setAssessmentScope(parentA, assessmentId, [topic.id], ctx())).rejects.toMatchObject({
        fieldErrors: { topics: expect.any(String) },
      });
      const rows = await db.select().from(assessmentScopeItems).where(eq(assessmentScopeItems.assessmentId, assessmentId));
      expect(rows.some((r) => r.topicId === topic.id)).toBe(false);
    });

    it("confirm -> unconfirm on change -> reconfirm", async () => {
      const state = async () => (await getScopeSetup(parentA, assessmentId, ctx()))!.assessment.scopeConfirmed;
      expect(await state()).toBe(false);
      await confirmScope(parentA, assessmentId, ctx());
      expect(await state()).toBe(true);
      // Same topics again: still confirmed.
      await setAssessmentScope(parentA, assessmentId, [topicId("Fractions")], ctx());
      expect(await state()).toBe(true);
      // A different set returns it to draft until re-confirmed.
      await setAssessmentScope(parentA, assessmentId, [topicId("Fractions"), topicId("Time")], ctx());
      expect(await state()).toBe(false);
      await confirmScope(parentA, assessmentId, ctx());
      expect(await state()).toBe(true);
    });

    it("confirmScope needs at least one topic", async () => {
      const [child] = (await getParentChildren(parentA, { db })).children;
      const empty = await newAssessment(parentA, child!.id);
      await expect(confirmScope(parentA, empty.id, ctx())).rejects.toBeInstanceOf(InputError);
    });
  });

  describe("paper settings and blueprint versions", () => {
    let assessmentId: string;

    beforeAll(async () => {
      const [child] = (await getParentChildren(parentA, { db })).children;
      assessmentId = (await newAssessment(parentA, child!.id)).id;
      await topics(parentA, assessmentId);
      await setAssessmentScope(
        parentA,
        assessmentId,
        ["Fractions", "Time", "Money"].map(topicId),
        ctx(),
      );
      await confirmScope(parentA, assessmentId, ctx());
    });

    const versions = async () =>
      (await db.select().from(assessmentBlueprints).where(eq(assessmentBlueprints.assessmentId, assessmentId))).length;
    const requirements = async () =>
      (await db.select().from(assessmentRequirements).where(eq(assessmentRequirements.assessmentId, assessmentId)))[0];

    it("stores recommended settings apart from scope and creates blueprint version 1", async () => {
      const row = await requirements();
      expect(row?.source).toBe("recommended");
      expect(row).toBeDefined();
      expect(await versions()).toBe(1);
      const setup = await getAssessmentSetup(parentA, assessmentId, ctx());
      expect(setup?.usingRecommended).toBe(true);
      expect(setup?.summary).toMatch(/^\d+ marks · \d+ minutes · /);
      expect(setup?.canGenerate).toBe(true);
      expect(setup?.preview?.totalMarks).toBe(setup?.settings.totalMarks);
    });

    it("confirming again without a change does not create a new version", async () => {
      await confirmScope(parentA, assessmentId, ctx());
      expect(await versions()).toBe(1);
    });

    it("parent settings are stored as parent and create version 2; saving the same again does not", async () => {
      await setPaperSettings(parentA, assessmentId, { totalMarks: 30, durationMinutes: 40, difficulty: "harder" }, ctx());
      expect(await requirements()).toMatchObject({ totalMarks: 30, durationMinutes: 40, difficulty: "harder", source: "parent" });
      expect(await versions()).toBe(2);
      await setPaperSettings(parentA, assessmentId, { totalMarks: 30, durationMinutes: 40, difficulty: "harder" }, ctx());
      expect(await versions()).toBe(2);
      const setup = await getAssessmentSetup(parentA, assessmentId, ctx());
      expect(setup?.summary.startsWith("30 marks · 40 minutes")).toBe(true);
      expect(setup?.usingRecommended).toBe(false);
    });

    it("rejects invalid values and stores nothing", async () => {
      for (const bad of [
        { totalMarks: 7, durationMinutes: 40, difficulty: "balanced" },
        { totalMarks: 65, durationMinutes: 40, difficulty: "balanced" },
        { totalMarks: 32, durationMinutes: 40, difficulty: "balanced" },
        { totalMarks: 30, durationMinutes: 5, difficulty: "balanced" },
        { totalMarks: 30, durationMinutes: 40, difficulty: "nightmare" },
      ]) {
        await expect(setPaperSettings(parentA, assessmentId, bad as never, ctx())).rejects.toBeInstanceOf(InputError);
      }
      expect(await requirements()).toMatchObject({ totalMarks: 30, source: "parent" });
    });

    it("useRecommendedSettings resets to the suggestion and versions the change", async () => {
      await useRecommendedSettings(parentA, assessmentId, ctx());
      expect(await requirements()).toMatchObject({ source: "recommended" });
      expect(await versions()).toBe(3);
    });

    it("a hard error blocks generation and is explained in plain words", async () => {
      await setPaperSettings(parentA, assessmentId, { totalMarks: 60, durationMinutes: 30, difficulty: "balanced" }, ctx());
      const setup = await getAssessmentSetup(parentA, assessmentId, ctx());
      // 60 marks may or may not be reachable with this bank; whichever it is, the outcome is consistent.
      expect(setup?.canGenerate).toBe(setup?.problems.length === 0);
      for (const line of [...(setup?.problems ?? []), ...(setup?.notices ?? [])]) {
        expect(line).not.toMatch(/blueprint|outcome|inventory|%|P3-/i);
      }
      expect(setup?.notices.some((n) => /tight/.test(n))).toBe(true);
    });

    it("leaves out topics the bank cannot cover, but keeps them in the scope", async () => {
      // The seeded bank covers every topic, so retire the approved questions of one topic to make a gap.
      const angles = topicId("Angles");
      await db.execute(sql`
        UPDATE questions SET status = 'retired'
        WHERE id IN (
          SELECT q.id FROM questions q
          JOIN question_outcomes qo ON qo.question_id = q.id AND qo.role = 'primary'
          JOIN curriculum_outcomes o ON o.id = qo.outcome_id
          WHERE o.topic_id = ${angles} AND q.status = 'approved')`);
      await topics(parentA, assessmentId);
      expect(topicsWithoutQuestions).toEqual(["Angles and right angles"]);
      const [child] = (await getParentChildren(parentA, { db })).children;
      const a = await newAssessment(parentA, child!.id);
      const empty = angles;
      await setAssessmentScope(parentA, a.id, [empty, topicId("Fractions")], ctx());
      await confirmScope(parentA, a.id, ctx());
      const setup = await getAssessmentSetup(parentA, a.id, ctx());
      expect(setup?.excludedNotice).toBe(`We can't include ${topicsWithoutQuestions[0]} yet, so this mock covers the other topic.`);
      expect(setup?.chosenTopics).toHaveLength(2);
      expect(setup?.summary).not.toContain(topicsWithoutQuestions[0]);
      const scope = await getScopeSetup(parentA, a.id, ctx());
      expect(scope?.topics.find((t) => t.id === empty)).toMatchObject({ selected: true, hasQuestions: false });
    });
  });

  describe("Prepare overview", () => {
    it("orders upcoming soonest first and puts past assessments apart", async () => {
      const parentD = (await insertParentProfile(db, "D")).id;
      const a = await createAssessment(parentD, { newChildNickname: "Test Child D", type: "wa3", date: "2026-11-01" }, ctx());
      await createAssessment(parentD, { childId: a.childId, type: "wa1", date: "2026-10-05" }, ctx());
      const earlier = { ...ctx(), now: new Date("2026-12-01T00:00:00Z") };
      const now = await getPrepareOverview(parentD, a.childId, ctx());
      expect(now.upcoming.map((c) => c.name)).toEqual(["WA1", "WA3"]);
      expect(now.upcoming[0]).toMatchObject({ stateText: "Choose topics", actionLabel: "Choose topics", countdown: "in 6 days" });
      const later = await getPrepareOverview(parentD, a.childId, earlier);
      expect(later.upcoming).toEqual([]);
      expect(later.past.map((c) => c.name)).toEqual(["WA3", "WA1"]);
    });
  });

  describe("ownership: parent B never reaches parent A's data", () => {
    let child: string;
    let assessment: string;
    let topic: string;

    beforeAll(async () => {
      const parentE = (await insertParentProfile(db, "E")).id;
      const a = await createAssessment(parentE, { newChildNickname: "Test Child E", type: "wa2", date: DATE_OK }, ctx());
      child = a.childId;
      assessment = a.id;
      topic = (await topics(parentE, assessment)).topics[0]!.id;
      await setAssessmentScope(parentE, assessment, [topic], ctx());
      await confirmScope(parentE, assessment, ctx());
    });

    it("every command answers not found", async () => {
      const b = parentB;
      await expect(updateChild(b, child, { nickname: "Hijack" }, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(archiveChild(b, child, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(selectChild(b, child, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(createAssessment(b, { childId: child, type: "wa1", date: DATE_OK }, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(setAssessmentScope(b, assessment, [topic], ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(confirmScope(b, assessment, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        setPaperSettings(b, assessment, { totalMarks: 20, durationMinutes: 30, difficulty: "easier" }, ctx()),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(useRecommendedSettings(b, assessment, ctx())).rejects.toBeInstanceOf(NotFoundError);
    });

    it("every query returns nothing", async () => {
      expect(await getAssessmentSetup(parentB, assessment, ctx())).toBeNull();
      expect(await getScopeSetup(parentB, assessment, ctx())).toBeNull();
      expect((await getPrepareOverview(parentB, child, ctx())).upcoming).toEqual([]);
      const state = await getParentHomeState(parentB, ctx());
      expect(state.assessments.some((x) => x.id === assessment)).toBe(false);
      expect(state.children.some((x) => x.id === child)).toBe(false);
    });

    it("nothing of parent A's child changed", async () => {
      const [row] = await db.select().from(childrenTable).where(eq(childrenTable.id, child));
      expect(row).toMatchObject({ nickname: "Test Child E", archivedAt: null });
      const scope = await db.select().from(assessmentScopeItems).where(and(eq(assessmentScopeItems.assessmentId, assessment)));
      expect(scope.length).toBeGreaterThan(0);
    });
  });
});
