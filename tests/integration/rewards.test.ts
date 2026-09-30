import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { markMistakesReviewed, markResultSeenByChild } from "@/application/commands/marking-review";
import { answerPracticeQuestion, finishPractice, startPractice } from "@/application/commands/practice";
import { createChild } from "@/application/commands/children";
import {
  approveRequest,
  cancelRequest,
  createReward,
  fulfilRequest,
  giveBonus,
  ledgerRowToEntry,
  rejectRequest,
  requestReward,
  setRewardActive,
  updateReward,
} from "@/application/commands/rewards";
import { InputError, NotFoundError } from "@/application/errors";
import type { CurrentChild } from "@/application/queries/current-child";
import { getLearningMap } from "@/application/queries/learning-map";
import { getParentHome } from "@/application/queries/parent-home";
import { getChildRewards, getParentRewards, getPointsGlance, getWaitingRequest } from "@/application/queries/rewards";
import { getPracticeRun } from "@/application/queries/practice";
import {
  awardForMistakeReview,
  awardForMockResult,
  awardForPractice,
  mistakeReviewEventId,
  mockResultEventId,
  practiceEventId,
  resolveRewardPolicy,
} from "@/application/rewards";
import { REWARD_POLICY_V1, balance, summariseLedger } from "@/domain/rewards";
import type { Database } from "@/repositories/postgres/client";
import { listPracticeItems, type PracticeItem } from "@/repositories/postgres/practice";
import { getBalance, getDecision, insertLedgerEntry, listLedgerEntries } from "@/repositories/postgres/rewards";
import { pointLedger, practiceSessions, rewardPolicies, rewardRedemptions } from "@/repositories/postgres/schema";
import { AnswerSchema } from "@/schemas/question-content";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { playMock } from "../helpers/play-mock";
import { BANK_TOPICS } from "../helpers/question-bank";
import { seedRealBank } from "../helpers/seed-bank";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

function answerOf(item: PracticeItem, right: boolean): { selected: string | null; typed: string | null } {
  const answer = AnswerSchema.parse(item.question.answer);
  switch (answer.kind) {
    case "mcq":
      return { selected: right ? answer.correct : (["A", "B", "C", "D"] as const).find((option) => option !== answer.correct)!, typed: null };
    case "number":
      return { selected: null, typed: right ? answer.value : "0.01" };
    case "fraction":
      return { selected: null, typed: right ? answer.value : "1/99" };
    case "text":
      return { selected: null, typed: right ? answer.accepted[0]! : "zzz" };
  }
}

/** The whole chain of messages of an error: drivers wrap the database's own message. */
function messages(error: unknown): string {
  const out: string[] = [];
  for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) out.push(cause.message);
  return out.join(" | ");
}

describe("Learning Points and parent rewards (Milestone 11)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parentA: string;
  let parentB: string;
  let child: CurrentChild;
  let sibling: CurrentChild;
  let otherChild: CurrentChild;
  let assessmentId: string;
  let mock: Awaited<ReturnType<typeof playMock>>;

  const ctx = (now: Date = at(2000)) => ({ db, now, storage });

  /** Plays one whole practice set on a topic (every question right unless `wrong` is given) and finishes it. */
  async function practise(who: CurrentChild, topicLabel: string, start: number, wrongAt: number[] = []): Promise<{ sessionId: string; reward: Awaited<ReturnType<typeof finishPractice>> }> {
    const map = await getLearningMap(who.childId, { db, now: at(start) });
    const topic = map!.topics.find((entry) => entry.label.startsWith(topicLabel))!;
    const { sessionId } = await startPractice(who, { kind: "topic", topicId: topic.topicId }, {}, ctx(at(start)));
    const items = await listPracticeItems(db, sessionId);
    let seconds = start + 30;
    for (const item of items) {
      await answerPracticeQuestion(who, sessionId, item.response.position, answerOf(item, !wrongAt.includes(item.response.position)), ctx(at(seconds)));
      seconds += 30;
    }
    return { sessionId, reward: await finishPractice(who, sessionId, ctx(at(seconds))) };
  }

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    storage = createMemoryStorage();
    await seedRealBank(db);
    parentA = (await insertParentProfile(db, "A")).id;
    parentB = (await insertParentProfile(db, "B")).id;
    const made = await confirmedAssessment(db, parentA, BANK_TOPICS.map((topic) => topic.label), { nickname: "Darius", type: "end_of_year" });
    assessmentId = made.assessmentId;
    child = { childId: made.childId, nickname: "Darius", deviceId: "device-a", parentProfileId: parentA };
    const other = await createChild(parentB, { nickname: "Test Child B" }, { db, now: NOW });
    otherChild = { childId: other.id, nickname: "Test Child B", deviceId: "device-b", parentProfileId: parentB };
    const twin = await createChild(parentA, { nickname: "Sibling" }, { db, now: NOW });
    sibling = { childId: twin.id, nickname: "Sibling", deviceId: "device-c", parentProfileId: parentA };
  });

  afterAll(async () => {
    await testDb.close();
  });

  // -------------------------------------------------------------------------
  describe("the policy", () => {
    it("seeds rewards-v1 with the same numbers as the engine's policy, and resolves it by time", async () => {
      const [row] = await db.select().from(rewardPolicies).where(eq(rewardPolicies.version, "rewards-v1"));
      expect(row?.status).toBe("active");
      expect(row?.policy).toEqual(JSON.parse(JSON.stringify(REWARD_POLICY_V1)));
      expect(await resolveRewardPolicy(db, at(0))).toEqual(REWARD_POLICY_V1);
    });

    it("keeps a published policy frozen: its numbers cannot change and it cannot be deleted", async () => {
      await expect(db.update(rewardPolicies).set({ policy: { version: "rewards-v1" } }).where(eq(rewardPolicies.version, "rewards-v1"))).rejects.toThrow();
      await expect(db.delete(rewardPolicies).where(eq(rewardPolicies.version, "rewards-v1"))).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  describe("the ledger", () => {
    it("rejects UPDATE and DELETE on any ledger row", async () => {
      const stored = await insertLedgerEntry(db, {
        childId: child.childId,
        amount: 3,
        origin: "parent_bonus",
        reasonCode: "manual_parent_bonus",
        sourceType: "parent",
        sourceEventId: "test:ledger-guard",
        note: "Guard test",
      });
      expect(stored).not.toBeNull();
      await expect(db.update(pointLedger).set({ amount: 300 }).where(eq(pointLedger.id, stored!.id))).rejects.toSatisfy((error: unknown) => /append-only/.test(messages(error)));
      await expect(db.delete(pointLedger).where(eq(pointLedger.id, stored!.id))).rejects.toSatisfy((error: unknown) => /append-only/.test(messages(error)));
      expect((await listLedgerEntries(db, child.childId)).find((row) => row.id === stored!.id)?.amount).toBe(3);
    });

    it("rejects a second entry for the same child and source event, and allows it for another child", async () => {
      const entry = { amount: 2, origin: "parent_bonus", reasonCode: "manual_parent_bonus", sourceType: "parent", sourceEventId: "test:duplicate", note: "Twice" };
      expect(await insertLedgerEntry(db, { ...entry, childId: child.childId })).not.toBeNull();
      expect(await insertLedgerEntry(db, { ...entry, childId: child.childId })).toBeNull();
      // Without the "do nothing on conflict" the database itself refuses.
      await expect(db.insert(pointLedger).values({ ...entry, childId: child.childId })).rejects.toSatisfy((error: unknown) => /unique|duplicate/i.test(messages(error)));
      expect(await insertLedgerEntry(db, { ...entry, childId: sibling.childId })).not.toBeNull();
    });

    it("requires a policy version for learning entries, a reason for bonuses and a non-zero amount", async () => {
      const bad = (extra: Record<string, unknown>) =>
        db.insert(pointLedger).values({ childId: child.childId, amount: 5, origin: "learning", reasonCode: "improvement", sourceType: "x", sourceEventId: `bad:${Math.random()}`, ...extra } as never);
      await expect(bad({})).rejects.toThrow();
      await expect(bad({ origin: "parent_bonus", reasonCode: "manual_parent_bonus" })).rejects.toThrow();
      await expect(bad({ policyVersion: "rewards-v1", amount: 0 })).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  describe("awarding after learning", () => {
    it("awards a marked mock once, and nothing while the paper is being sat", async () => {
      // A second paper that is started but never handed in: nothing to award, nothing recorded.
      mock = await playMock({
        db,
        storage,
        parentProfileId: parentA,
        child,
        assessmentId,
        key: 1,
        plan: (item) => (item.position % 4 === 0 ? "wrong" : item.position % 7 === 0 ? "blank" : "right"),
      });
      const decision = await getDecision(db, child.childId, mockResultEventId(mock.attemptId));
      expect(decision).not.toBeNull();
      expect(decision!.points).toBeGreaterThan(0);
      expect(decision!.policyVersion).toBe("rewards-v1");
      const entries = (await listLedgerEntries(db, child.childId)).filter((row) => row.sourceEventId === mockResultEventId(mock.attemptId));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ origin: "learning", amount: decision!.points, sourceType: "mock_attempt", sourceId: mock.attemptId, policyVersion: "rewards-v1" });
      expect(entries[0]!.masteryBefore).not.toBeNull();
      expect(entries[0]!.calculation).toMatchObject({ activityType: "mock", scopeKey: expect.any(String) });

      // Running it again (a retry, a second job) pays nothing more.
      const again = await awardForMockResult(db, child.childId, mock.attemptId, at(5000));
      expect(again?.points).toBe(decision!.points);
      expect((await listLedgerEntries(db, child.childId)).filter((row) => row.sourceEventId === mockResultEventId(mock.attemptId))).toHaveLength(1);
    });

    it("does not award a mock that is not marked, or one that is not the child's", async () => {
      expect(await awardForMockResult(db, otherChild.childId, mock.attemptId, at(5000))).toBeNull();
      expect(await getDecision(db, otherChild.childId, mockResultEventId(mock.attemptId))).toBeNull();
      expect(await awardForMockResult(db, child.childId, "00000000-0000-4000-8000-00000000dead", at(5000))).toBeNull();
    });

    it("awards going through mistakes once, as its own separate entry", async () => {
      await markResultSeenByChild(child.childId, mock.attemptId, ctx(at(2000)));
      const before = await getBalance(db, child.childId);
      await markMistakesReviewed({ childId: child.childId }, mock.attemptId, ctx(at(2100)));
      const decision = await getDecision(db, child.childId, mistakeReviewEventId(mock.attemptId));
      expect(decision).not.toBeNull();
      expect(decision!.points).toBeGreaterThan(0);
      expect(decision!.reasonCodes).toEqual(["mistake_review"]);
      expect(await getBalance(db, child.childId)).toBe(before + decision!.points);
      // Marking them reviewed again, or awarding again, pays nothing.
      await markMistakesReviewed({ childId: child.childId }, mock.attemptId, ctx(at(2200)));
      await awardForMistakeReview(db, child.childId, mock.attemptId, at(2300));
      expect(await getBalance(db, child.childId)).toBe(before + decision!.points);
      expect((await listLedgerEntries(db, child.childId)).filter((row) => row.sourceEventId === mistakeReviewEventId(mock.attemptId))).toHaveLength(1);
    });

    it("awards a finished practice set once, with a plain reason line and the same answer every time", async () => {
      const before = await getBalance(db, child.childId);
      const { sessionId } = await practise(child, "Money", 3000, [2]);
      const decision = await getDecision(db, child.childId, practiceEventId(sessionId));
      expect(decision).not.toBeNull();
      expect(decision!.points).toBeGreaterThan(0);
      expect(await getBalance(db, child.childId)).toBe(before + decision!.points);

      const run = await getPracticeRun(child, sessionId, ctx(at(4000)));
      if (run?.state !== "done") throw new Error("expected the end screen");
      expect(run.reward?.points).toBe(decision!.points);
      expect(run.reward?.line).toMatch(/^\+\d+ Learning Points? · You .+\.$/);
      expect(run.reward?.line).toContain("Money");

      // Finishing again, or asking for the end screen again, never pays twice.
      await finishPractice(child, sessionId, ctx(at(4100)));
      await getPracticeRun(child, sessionId, ctx(at(4200)));
      await awardForPractice(db, child.childId, sessionId, at(4300));
      expect(await getBalance(db, child.childId)).toBe(before + decision!.points);
    });

    it("gives less for the same work again straight away, and points to somewhere better to go", async () => {
      const first = await getDecision(
        db,
        child.childId,
        practiceEventId((await db.select().from(practiceSessions).where(eq(practiceSessions.childId, child.childId)))[0]!.id),
      );
      const { sessionId } = await practise(child, "Money", 5000);
      const second = await getDecision(db, child.childId, practiceEventId(sessionId));
      expect(second).not.toBeNull();
      expect(second!.points).toBeLessThanOrEqual(first!.points);
    });

    it("records a zero decision without a ledger entry when a set left nothing to reward", async () => {
      const map = await getLearningMap(sibling.childId, { db, now: at(6000) });
      const topic = map!.topics[0]!;
      const { sessionId } = await startPractice(sibling, { kind: "topic", topicId: topic.topicId }, {}, ctx(at(6000)));
      await db.update(practiceSessions).set({ status: "completed", completedAt: at(6100), minutes: 1 }).where(eq(practiceSessions.id, sessionId));
      const reward = await awardForPractice(db, sibling.childId, sessionId, at(6200));
      expect(reward).toMatchObject({ points: 0, line: null });
      expect(await getDecision(db, sibling.childId, practiceEventId(sessionId))).toMatchObject({ points: 0, ledgerEntryId: null });
      expect(await getBalance(db, sibling.childId)).toBe(2);
    });

    it("never lets awarding change a finished set: it is paid later, when the reward is found working again", async () => {
      await db.update(rewardPolicies).set({ status: "retired" }).where(eq(rewardPolicies.version, "rewards-v1"));
      const { sessionId } = await practise(child, "Fractions", 7000);
      const [session] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId));
      expect(session?.status).toBe("completed");
      expect(await getDecision(db, child.childId, practiceEventId(sessionId))).toBeNull();

      await db.update(rewardPolicies).set({ status: "active" }).where(eq(rewardPolicies.version, "rewards-v1"));
      const run = await getPracticeRun(child, sessionId, ctx(at(9000)));
      if (run?.state !== "done") throw new Error("expected the end screen");
      expect(run.reward).not.toBeNull();
      expect(await getDecision(db, child.childId, practiceEventId(sessionId))).not.toBeNull();
    });

    it("keeps the balance equal to the ledger sum", async () => {
      const entries = (await listLedgerEntries(db, child.childId)).map(ledgerRowToEntry);
      expect(await getBalance(db, child.childId)).toBe(balance(entries));
      expect(summariseLedger(entries, child.childId).balance).toBe(balance(entries));
    });
  });

  // -------------------------------------------------------------------------
  describe("rewards and requests", () => {
    let balanceNow: number;
    let rewardId: string;
    let cost: number;

    beforeAll(async () => {
      balanceNow = await getBalance(db, child.childId);
      cost = Math.max(2, Math.min(10, balanceNow - 1));
    });

    it("lets a parent create a reward, and refuses a cost that is not a whole number above zero", async () => {
      const created = await createReward(parentA, { title: "  Ice   cream ", cost: String(cost), icon: "treat" }, ctx());
      rewardId = created.rewardId;
      await expect(createReward(parentA, { title: "Free", cost: "0" }, ctx())).rejects.toBeInstanceOf(InputError);
      await expect(createReward(parentA, { title: "Half", cost: "2.5" }, ctx())).rejects.toBeInstanceOf(InputError);
      await expect(createReward(parentA, { title: "", cost: "5" }, ctx())).rejects.toMatchObject({ fieldErrors: { title: expect.any(String) } });
      await expect(createReward(parentA, { title: "Odd picture", cost: "5", icon: "loot-box" }, ctx())).rejects.toBeInstanceOf(InputError);
      await expect(createReward(parentA, { title: "Trip", cost: "5", availableFrom: "2026-12-10", availableUntil: "2026-12-01" }, ctx())).rejects.toMatchObject({ fieldErrors: { availableUntil: expect.any(String) } });
      // A child that is not theirs cannot be named.
      await expect(createReward(parentA, { title: "Trip", cost: "5", childId: otherChild.childId }, ctx())).rejects.toBeInstanceOf(NotFoundError);
      const view = await getChildRewards(child, ctx());
      expect(view.rewards).toMatchObject([{ id: rewardId, title: "Ice cream", cost, state: "ready", moreText: null, progress: 1 }]);
    });

    it("shows the child how many more points a dearer reward needs, and refuses to request it", async () => {
      const dear = await createReward(parentA, { title: "Big trip", cost: String(balanceNow + 12) }, ctx());
      const view = await getChildRewards(child, ctx());
      const card = view.rewards.find((entry) => entry.id === dear.rewardId)!;
      expect(card).toMatchObject({ state: "more", moreText: "12 more points" });
      await expect(requestReward(child, dear.rewardId, ctx())).rejects.toBeInstanceOf(InputError);
      await setRewardActive(parentA, dear.rewardId, false, ctx());
      expect((await getChildRewards(child, ctx())).rewards.map((entry) => entry.id)).toEqual([rewardId]);
      await expect(requestReward(child, dear.rewardId, ctx())).rejects.toBeInstanceOf(InputError);
    });

    it("keeps one family's rewards from another's", async () => {
      await expect(requestReward(otherChild, rewardId, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(updateReward(parentB, rewardId, { title: "Mine now", cost: "1" }, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(setRewardActive(parentB, rewardId, false, ctx())).rejects.toBeInstanceOf(NotFoundError);
      const parentView = await getParentRewards(parentB, ctx());
      if (parentView.kind !== "ok") throw new Error("expected a view");
      expect(parentView.rewards).toHaveLength(0);
      expect(parentView.pending).toHaveLength(0);
    });

    it("sends a request without taking any points, and a second tap does not send another", async () => {
      const first = await requestReward(child, rewardId, ctx(at(9100)));
      expect(first.status).toBe("requested");
      expect(await getBalance(db, child.childId)).toBe(balanceNow);
      const second = await requestReward(child, rewardId, ctx(at(9101)));
      expect(second).toEqual({ status: "already_waiting", redemptionId: first.redemptionId });
      expect(await db.select().from(rewardRedemptions)).toHaveLength(1);
      const view = await getChildRewards(child, ctx(at(9102)));
      expect(view.rewards[0]?.state).toBe("waiting");
      expect(view.requests[0]).toMatchObject({ status: "requested", statusText: "Waiting for your grown-up", canTakeBack: true });
      expect(await getWaitingRequest(parentA, ctx())).toMatchObject({ count: 1, childNickname: "Darius", title: "Ice cream" });
    });

    it("shows a waiting request on the parent's Home only as secondary while other work is due", async () => {
      const home = await getParentHome(parentA, ctx(at(9200)));
      expect(home.rewardRequest).toMatchObject({ childNickname: "Darius", title: "Ice cream" });
      expect(home.action.kind).not.toBe("done_today");
      expect(home.action.title).not.toMatch(/ice cream/i);
    });

    it("lets the child take a request back without touching the balance, and only their own", async () => {
      const { redemptionId } = await requestReward(child, rewardId, ctx(at(9300)));
      await expect(cancelRequest(otherChild, redemptionId, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await cancelRequest(child, redemptionId, ctx(at(9310)));
      await cancelRequest(child, redemptionId, ctx(at(9311)));
      expect(await getBalance(db, child.childId)).toBe(balanceNow);
      const [row] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, redemptionId));
      expect(row?.status).toBe("cancelled");
      // It was the one waiting request, so none is left open.
      expect(await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.status, "requested"))).toHaveLength(0);
    });

    it("keeps the balance when a parent says not now, and other parents cannot decide", async () => {
      const waiting = await requestReward(child, rewardId, ctx(at(9390)));
      await expect(rejectRequest(parentB, waiting.redemptionId, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(approveRequest(parentB, waiting.redemptionId, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await rejectRequest(parentA, waiting.redemptionId, ctx(at(9400)));
      expect(await getBalance(db, child.childId)).toBe(balanceNow);
      const [row] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, waiting.redemptionId));
      expect(row?.status).toBe("rejected");
      await expect(approveRequest(parentA, waiting.redemptionId, ctx(at(9410)))).rejects.toBeInstanceOf(InputError);
      expect(await getBalance(db, child.childId)).toBe(balanceNow);
    });

    it("takes the points off exactly once on approval, then marks it given after it is approved", async () => {
      const { redemptionId } = await requestReward(child, rewardId, ctx(at(9500)));
      await expect(fulfilRequest(parentA, redemptionId, ctx(at(9505)))).rejects.toBeInstanceOf(InputError);
      await approveRequest(parentA, redemptionId, ctx(at(9510)));
      expect(await getBalance(db, child.childId)).toBe(balanceNow - cost);
      // A second tap, or a second parent tab, takes nothing more.
      await approveRequest(parentA, redemptionId, ctx(at(9511)));
      expect(await getBalance(db, child.childId)).toBe(balanceNow - cost);

      const debits = (await listLedgerEntries(db, child.childId)).filter((row) => row.origin === "redemption");
      expect(debits).toHaveLength(1);
      expect(debits[0]).toMatchObject({ amount: -cost, reasonCode: "reward_redemption", sourceType: "redemption", sourceId: redemptionId });
      const [approved] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, redemptionId));
      expect(approved).toMatchObject({ status: "approved", debitLedgerEntryId: debits[0]!.id, pointsCostSnapshot: cost });

      const parentView = await getParentRewards(parentA, ctx(at(9520)));
      if (parentView.kind !== "ok") throw new Error("expected a view");
      expect(parentView.awaiting).toMatchObject([{ id: redemptionId, title: "Ice cream" }]);

      await fulfilRequest(parentA, redemptionId, ctx(at(9600)));
      const [given] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, redemptionId));
      expect(given?.status).toBe("fulfilled");
      expect(given?.fulfilledAt).not.toBeNull();
      expect(await getBalance(db, child.childId)).toBe(balanceNow - cost);
      expect((await getChildRewards(child, ctx(at(9610)))).requests[0]?.statusText).toBe("Given. Enjoy!");
    });

    it("keeps the name and cost a request was made with when the reward is edited", async () => {
      const { rewardId: second } = await createReward(parentA, { title: "Film night", cost: "2" }, ctx());
      const { redemptionId } = await requestReward(child, second, ctx(at(9700)));
      await updateReward(parentA, second, { title: "Cinema trip", cost: "4000" }, ctx());
      const view = await getChildRewards(child, ctx(at(9710)));
      expect(view.requests.find((request) => request.id === redemptionId)?.title).toBe("Film night");
      await approveRequest(parentA, redemptionId, ctx(at(9720)));
      const debit = (await listLedgerEntries(db, child.childId)).find((row) => row.sourceId === redemptionId);
      expect(debit?.amount).toBe(-2);
    });

    it("refuses to approve when the child no longer has enough points", async () => {
      const current = await getBalance(db, child.childId);
      const { rewardId: pricey } = await createReward(parentA, { title: "Books", cost: String(current) }, ctx());
      const { rewardId: other } = await createReward(parentA, { title: "Sweets", cost: "1" }, ctx());
      const asked = await requestReward(child, pricey, ctx(at(9800)));
      const spent = await requestReward(child, other, ctx(at(9801)));
      await approveRequest(parentA, spent.redemptionId, ctx(at(9810)));
      expect(await getBalance(db, child.childId)).toBe(current - 1);
      await expect(approveRequest(parentA, asked.redemptionId, ctx(at(9820)))).rejects.toMatchObject({ fieldErrors: { form: expect.stringContaining("enough points") } });
      expect(await getBalance(db, child.childId)).toBe(current - 1);
      const [row] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, asked.redemptionId));
      expect(row?.status).toBe("requested");
      const parentView = await getParentRewards(parentA, ctx(at(9830)));
      if (parentView.kind !== "ok") throw new Error("expected a view");
      expect(parentView.pending.find((request) => request.id === asked.redemptionId)?.canApprove).toBe(false);
    });

    it("applies a weekly limit and the availability dates", async () => {
      const { rewardId: limited } = await createReward(parentA, { title: "Park", cost: "1", weeklyLimit: "1" }, ctx());
      const first = await requestReward(child, limited, ctx(at(9900)));
      await cancelRequest(child, first.redemptionId, ctx(at(9901)));
      // A request taken back does not use up the week.
      const again = await requestReward(child, limited, ctx(at(9902)));
      await rejectRequest(parentA, again.redemptionId, ctx(at(9903)));
      await requestReward(child, limited, ctx(at(9904)));
      const waiting = (await getChildRewards(child, ctx(at(9905)))).requests.find((request) => request.status === "requested");
      const redemptionId = waiting!.id;
      await approveRequest(parentA, redemptionId, ctx(at(9906)));
      await expect(requestReward(child, limited, ctx(at(9907)))).rejects.toMatchObject({ fieldErrors: { form: expect.stringContaining("this week") } });

      const { rewardId: later } = await createReward(parentA, { title: "December trip", cost: "1", availableFrom: "2026-12-01" }, ctx());
      await expect(requestReward(child, later, ctx(at(9908)))).rejects.toBeInstanceOf(InputError);
      expect((await getChildRewards(child, ctx(at(9909)))).rewards.map((entry) => entry.id)).not.toContain(later);
    });
  });

  // -------------------------------------------------------------------------
  describe("bonus points", () => {
    it("adds a parent's bonus as its own kind of entry, separate from learning, and needs a reason", async () => {
      const before = summariseLedger((await listLedgerEntries(db, child.childId)).map(ledgerRowToEntry), child.childId);
      await expect(giveBonus(parentA, child.childId, { points: "5", reason: "  " }, "11111111-1111-4111-8111-111111111111", ctx())).rejects.toMatchObject({ fieldErrors: { reason: expect.any(String) } });
      await expect(giveBonus(parentA, child.childId, { points: "0", reason: "Kind" }, "11111111-1111-4111-8111-111111111111", ctx())).rejects.toBeInstanceOf(InputError);
      await expect(giveBonus(parentB, child.childId, { points: "5", reason: "Kind" }, "11111111-1111-4111-8111-111111111111", ctx())).rejects.toBeInstanceOf(NotFoundError);

      const key = "22222222-2222-4222-8222-222222222222";
      expect(await giveBonus(parentA, child.childId, { points: "5", reason: "Helped at home" }, key, ctx(at(10000)))).toEqual({ given: true, points: 5 });
      // A double tap gives once.
      expect(await giveBonus(parentA, child.childId, { points: "5", reason: "Helped at home" }, key, ctx(at(10001)))).toEqual({ given: false, points: 5 });
      const after = summariseLedger((await listLedgerEntries(db, child.childId)).map(ledgerRowToEntry), child.childId);
      expect(after.manualParentBonus - before.manualParentBonus).toBe(5);
      expect(after.learningEarned).toBe(before.learningEarned);
      expect(after.balance - before.balance).toBe(5);
    });

    it("shows learning points and bonuses apart on the parent's Rewards, with reasons in plain words", async () => {
      const view = await getParentRewards(parentA, { db, now: at(10100) });
      if (view.kind !== "ok") throw new Error("expected a view");
      expect(view.child.nickname).toBe("Darius");
      expect(view.week.learning).toBeGreaterThan(0);
      // The 5 given here, and the 3 and 2 the ledger tests added by hand.
      expect(view.week.bonus).toBe(10);
      expect(view.week.topReasons.length).toBeGreaterThan(0);
      for (const reason of view.week.topReasons) expect(reason.label).not.toMatch(/_|multiplier|decay/);
      expect(view.history.some((entry) => entry.kind === "bonus" && entry.label === "Bonus: Helped at home")).toBe(true);
      expect(view.history.some((entry) => entry.kind === "learning")).toBe(true);
      expect(view.history.some((entry) => entry.kind === "reward")).toBe(true);
    });

    it("gives Today a quiet points line with the nearest reward", async () => {
      const glance = await getPointsGlance(child, { db, now: at(10200) });
      expect(glance.balance).toBe(await getBalance(db, child.childId));
      expect(glance.nearest).not.toBeNull();
    });
  });
});
