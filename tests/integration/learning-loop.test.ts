import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { markMistakesReviewed, markResultSeenByChild, markResultSeenByParent } from "@/application/commands/marking-review";
import { addSimilarQuestion, answerPracticeQuestion, finishPractice, startPractice, startRecommendedPractice, suggestPractice } from "@/application/commands/practice";
import { InputError, NotFoundError } from "@/application/errors";
import { createChild } from "@/application/commands/children";
import { getChildToday } from "@/application/queries/child-today";
import type { CurrentChild } from "@/application/queries/current-child";
import { getLearningMap } from "@/application/queries/learning-map";
import { getParentHome } from "@/application/queries/parent-home";
import { getChildProgress, getParentPracticeSuggestion, getParentProgress, getParentTopicProgress } from "@/application/queries/progress";
import { getMarkedPaper } from "@/application/queries/results";
import { getPracticeAsset, getPracticeHome, getPracticeRun } from "@/application/queries/practice";
import type { Database } from "@/repositories/postgres/client";
import { listEvidenceForChild, listMasteryProfiles } from "@/repositories/postgres/mastery";
import { listPracticeItems, type PracticeItem } from "@/repositories/postgres/practice";
import { masteryEvidence, practiceSessions, practiceSuggestions } from "@/repositories/postgres/schema";
import { AnswerSchema } from "@/schemas/question-content";
import { insertParentProfile } from "../factories";
import { confirmedAssessment, NOW } from "../helpers/assessment-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { playMock } from "../helpers/play-mock";
import { BANK_TOPICS } from "../helpers/question-bank";
import { seedRealBank } from "../helpers/seed-bank";
import { silentLogger } from "../helpers/silent-logger";
import { createTestDb, type TestDatabase } from "../helpers/test-db";

const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

/** What a child would give for a question: the right answer, or a wrong one. */
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

describe("the learning loop: practice, progress and suggestions (M8, M9)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parentA: string;
  let parentB: string;
  let child: CurrentChild;
  let otherChild: CurrentChild;
  let siblingId: string;
  let assessmentId: string;
  let mock: Awaited<ReturnType<typeof playMock>>;

  const ctx = (now: Date = at(2000)) => ({ db, now, storage, logger: silentLogger });

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
    siblingId = (await createChild(parentA, { nickname: "Sibling" }, { db, now: NOW })).id;
    // Mock 1: every fourth question wrong, every seventh left blank, the rest right.
    mock = await playMock({
      db,
      storage,
      parentProfileId: parentA,
      child,
      assessmentId,
      key: 1,
      plan: (item) => (item.position % 4 === 0 ? "wrong" : item.position % 7 === 0 ? "blank" : "right"),
    });
  });

  afterAll(async () => {
    await testDb.close();
  });

  // -------------------------------------------------------------------------
  it("after the mock is marked, Today points at the result, then the mistakes, then practice", async () => {
    expect((await getChildToday(child, ctx())).action.kind).toBe("see_results");
    await markResultSeenByChild(child.childId, mock.attemptId, ctx());
    const fix = (await getChildToday(child, ctx())).action;
    expect(fix).toMatchObject({ kind: "fix_mistakes", href: `/results/${mock.attemptId}/mistakes` });
    await markMistakesReviewed({ childId: child.childId }, mock.attemptId, ctx());
    const practice = (await getChildToday(child, ctx())).action;
    expect(practice).toMatchObject({ kind: "start_practice", ctaLabel: "Start", href: "/practice", supportingText: "About 15 minutes." });
    expect(practice.practiceTopicId).toBeDefined();
  });

  it("gives the parent Suggest as the next action while the child has not practised yet", async () => {
    await markResultSeenByParent(parentA, mock.attemptId, ctx());
    const progress = await getParentProgress(parentA, ctx(at(2000)));
    if (progress.kind !== "ready") throw new Error("expected progress");
    expect(progress.action).toMatchObject({ kind: "start_practice", href: expect.stringMatching(/^\/progress\/practice\?topic=/) });
    expect(progress.action.ctaLabel).toMatch(/^Suggest .+ practice to Darius$/);
    expect((await getParentHome(parentA, ctx(at(2000)))).action.ctaLabel).toMatch(/^Start 15-minute .+ practice$/);
  });

  it("has a learning map: topics with their skills and where the child is, only for what the bank can test", async () => {
    const map = await getLearningMap(child.childId, { db, now: at(2000) });
    expect(map).not.toBeNull();
    expect(map!.topics.length).toBeGreaterThan(5);
    for (const topic of map!.topics) {
      expect(topic.testable.length).toBeGreaterThan(0);
      expect(topic.practice.outcomeId).toBe(topic.topicId);
    }
    const started = map!.topics.filter((topic) => topic.mastery.state !== "not_started");
    expect(started.length).toBeGreaterThan(0);
    // A first mock alone can never make a topic better than "almost there".
    expect(started.every((topic) => ["learning", "developing", "almost_mastered"].includes(topic.mastery.state))).toBe(true);
  });

  // -------------------------------------------------------------------------
  let sessionId: string;
  let topicId: string;
  let firstEvidenceCount: number;

  it("starts a set of 6 to 10 approved questions for a topic, and starting again resumes it", async () => {
    firstEvidenceCount = (await listEvidenceForChild(db, child.childId)).length;
    // Money is one skill with plenty of number and multiple-choice questions, so what follows never depends on the luck of the draw.
    const map = await getLearningMap(child.childId, { db, now: at(2000) });
    const money = map!.topics.find((topic) => topic.label.startsWith("Money"))!;
    const started = await startPractice(child, { kind: "topic", topicId: money.topicId }, {}, ctx());
    expect(started.resumed).toBe(false);
    sessionId = started.sessionId;
    const items = await listPracticeItems(db, sessionId);
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.length).toBeLessThanOrEqual(10);
    expect(items.every((item) => item.question.status === "approved")).toBe(true);
    expect(items.map((item) => item.response.position)).toEqual(items.map((_, i) => i + 1));
    expect(new Set(items.map((item) => item.question.id)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.question.familyId)).size).toBe(items.length);
    const [session] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId));
    expect(session).toMatchObject({ childId: child.childId, status: "in_progress", origin: "chosen", focusKind: "topic", focusLabel: money.label });
    topicId = session!.topicId;
    // Nothing answered yet, so nothing counts.
    expect(await listEvidenceForChild(db, child.childId)).toHaveLength(firstEvidenceCount);

    // Starting what is recommended, or anything else, while a set is open goes back to that set.
    expect(await startRecommendedPractice(child, ctx(at(2100)))).toEqual({ sessionId, resumed: true });
    expect(await startPractice(child, { kind: "topic", topicId: money.topicId }, {}, ctx(at(2100)))).toEqual({ sessionId, resumed: true });
    expect(await db.select().from(practiceSessions)).toHaveLength(1);
  });

  it("Today resumes the unfinished set in one tap, and only the child it belongs to can open it", async () => {
    const today = (await getChildToday(child, ctx(at(2100)))).action;
    expect(today).toMatchObject({ kind: "resume_practice", href: `/practice/session/${sessionId}`, ctaLabel: "Continue" });
    expect(await getPracticeRun(otherChild, sessionId, ctx())).toBeNull();
    expect(await getPracticeRun(child, "not-a-uuid", ctx())).toBeNull();
    await expect(answerPracticeQuestion(otherChild, sessionId, 1, { selected: "A", typed: "1" }, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(startPractice(otherChild, { kind: "topic", topicId }, {}, ctx())).resolves.toMatchObject({ resumed: false });
    const home = await getPracticeHome(child, {}, ctx(at(2100)));
    expect(home.primary).toMatchObject({ kind: "resume", sessionId });
  });

  it("shows one question at a time with no answer, hint or solution in what the screen is given", async () => {
    const run = await getPracticeRun(child, sessionId, ctx(at(2100)));
    if (run?.state !== "question") throw new Error("expected a question");
    expect(run.question.position).toBe(1);
    expect(run.progressText).toMatch(/^Question 1 of \d+$/);
    expect(run.dots.filter((dot) => dot.current)).toHaveLength(1);
    const json = JSON.stringify(run).toLowerCase();
    expect(json).not.toMatch(/correct|workedsolution|markingscheme|"answer"/);
  });

  // -------------------------------------------------------------------------
  it("marks a right answer by rule, keeps it as evidence once, and updates the profile", async () => {
    const items = await listPracticeItems(db, sessionId);
    const first = items[0]!;
    const feedback = await answerPracticeQuestion(child, sessionId, 1, answerOf(first, true), ctx(at(2200)));
    expect(feedback).toMatchObject({ result: "right", hint: null, solution: [], correctAnswer: "", isLast: false, canTryLike: false });

    const evidence = (await listEvidenceForChild(db, child.childId)).filter((row) => row.sourceKind === "practice");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ practiceSessionId: sessionId, questionId: first.question.id, scoreRatio: 1, attemptId: null, childId: child.childId });
    const profile = (await listMasteryProfiles(db, child.childId)).find((row) => row.outcomeId === first.response.outcomeId);
    expect(profile?.sessions).toBeGreaterThanOrEqual(1);

    // Checking the same question again changes nothing.
    const again = await answerPracticeQuestion(child, sessionId, 1, answerOf(first, false), ctx(at(2210)));
    expect(again.result).toBe("right");
    expect((await listEvidenceForChild(db, child.childId)).filter((row) => row.sourceKind === "practice")).toHaveLength(1);
  });

  it("needs an answer to check, and says so kindly", async () => {
    await expect(answerPracticeQuestion(child, sessionId, 2, { selected: null, typed: null }, ctx(at(2220)))).rejects.toBeInstanceOf(InputError);
    await expect(answerPracticeQuestion(child, sessionId, 2, { selected: null, typed: "   " }, ctx(at(2220)))).rejects.toBeInstanceOf(InputError);
    await expect(answerPracticeQuestion(child, sessionId, 99, { selected: "A", typed: "1" }, ctx(at(2220)))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("after a wrong answer: a hint first, the whole solution to ask for, and a similar question from another family", async () => {
    const items = await listPracticeItems(db, sessionId);
    const second = items[1]!;
    const feedback = await answerPracticeQuestion(child, sessionId, 2, answerOf(second, false), ctx(at(2300)));
    expect(feedback.result).toBe("wrong");
    expect(feedback.hint).not.toBeNull();
    expect(feedback.solution.length).toBeGreaterThan(0);
    expect(feedback.correctAnswer.length).toBeGreaterThan(0);
    if (second.question.workedSolution && (second.question.workedSolution as unknown[]).length > 1) {
      expect(feedback.hint).toMatchObject({ kind: "step" });
      if (feedback.hint?.kind === "step") expect(feedback.hint.blocks).toEqual([feedback.solution[0]]);
    }
    expect(feedback.canTryLike).toBe(true);

    const before = await listPracticeItems(db, sessionId);
    const { position } = await addSimilarQuestion(child, sessionId, 2, ctx(at(2310)));
    expect(position).toBe(3);
    const after = await listPracticeItems(db, sessionId);
    expect(after).toHaveLength(before.length + 1);
    expect(after.map((item) => item.response.position)).toEqual(after.map((_, i) => i + 1));
    const added = after[2]!;
    expect(added.response).toMatchObject({ addedAs: "similar", outcomeId: second.response.outcomeId, answeredAt: null });
    expect(added.question.familyId).not.toBe(second.question.familyId);
    expect(new Set(after.map((item) => item.question.id)).size).toBe(after.length);
    // The next question to answer is the new one, and a second tap does not add another.
    const run = await getPracticeRun(child, sessionId, ctx(at(2310)));
    expect(run?.state === "question" && run.question.position).toBe(3);
    expect((await addSimilarQuestion(child, sessionId, 2, ctx(at(2311)))).position).toBe(3);
    expect(await listPracticeItems(db, sessionId)).toHaveLength(after.length);
    // A question that was right offers nothing to try again.
    await expect(addSimilarQuestion(child, sessionId, 1, ctx(at(2312)))).rejects.toBeInstanceOf(InputError);
  });

  it("a wrong answer is evidence too, and only first attempts count towards mastery", async () => {
    const evidence = (await listEvidenceForChild(db, child.childId)).filter((row) => row.sourceKind === "practice");
    expect(evidence.map((row) => row.scoreRatio)).toEqual([1, 0]);
    expect(evidence.every((row) => row.firstAttempt === true || row.firstAttempt === false)).toBe(true);
  });

  it("finishes only when every question is answered, then shows the calm end screen with one next step", async () => {
    await expect(finishPractice(child, sessionId, ctx(at(2400)))).rejects.toBeInstanceOf(InputError);
    let clock = 2400;
    for (;;) {
      const items = await listPracticeItems(db, sessionId);
      const next = items.find((item) => item.response.answeredAt === null);
      if (!next) break;
      clock += 30;
      const feedback = await answerPracticeQuestion(child, sessionId, next.response.position, answerOf(next, true), ctx(at(clock)));
      expect(feedback.isLast).toBe(items.filter((item) => item.response.answeredAt === null).length === 1);
    }
    const run = await getPracticeRun(child, sessionId, ctx(at(clock)));
    expect(run?.state).toBe("finish");
    const finished = await finishPractice(child, sessionId, ctx(at(clock + 5)));
    expect(finished.minutes).toBeGreaterThanOrEqual(1);
    expect((await finishPractice(child, sessionId, ctx(at(clock + 60)))).minutes).toBe(finished.minutes);

    const done = await getPracticeRun(child, sessionId, ctx(at(clock + 60)));
    if (done?.state !== "done") throw new Error("expected the end screen");
    const focus = (await db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)))[0]!.focusLabel;
    expect(done.endText).toBe(`Good work. You practised ${focus} for ${finished.minutes} minute${finished.minutes === 1 ? "" : "s"}.`);
    // One set is the day's plan: the next step is "You're done for today".
    expect(done.next).toMatchObject({ kind: "done_today", title: "You're done for today. Nice work." });
    await expect(answerPracticeQuestion(child, sessionId, 1, answerOf((await listPracticeItems(db, sessionId))[0]!, true), ctx())).rejects.toBeInstanceOf(InputError);
    // The words of the end screen and of Today never mention mastery or a percentage. Learning Points are
    // shown there after learning (Milestone 11), in plain words: no codes, no percentages.
    const { reward, ...words } = done;
    expect(JSON.stringify(words).toLowerCase()).not.toMatch(/mastery|points|percent|%/);
    expect(`${reward?.line ?? ""} ${reward?.redirect ?? ""}`.toLowerCase()).not.toMatch(/mastery|percent|%|_/);
  });

  it("practice moved the child's skills forward and never past what the evidence supports", async () => {
    const profiles = await listMasteryProfiles(db, child.childId);
    for (const profile of profiles) {
      const evidence = (await listEvidenceForChild(db, child.childId)).filter((row) => row.outcomeId === profile.outcomeId && row.firstAttempt);
      expect(profile.evidenceCount).toBe(evidence.length);
    }
    // Only a mock and one practice: nobody is "Secure" yet.
    expect(profiles.every((profile) => profile.state !== "mastered" && profile.state !== "retained")).toBe(true);
    expect((await listEvidenceForChild(db, child.childId)).filter((row) => row.sourceKind === "practice").length).toBeGreaterThanOrEqual(7);
  });

  // -------------------------------------------------------------------------
  it("keeps the evidence of a different child out of every view, and their practice private", async () => {
    expect(await listEvidenceForChild(db, otherChild.childId)).toHaveLength(0);
    const progress = await getChildProgress(otherChild, ctx());
    expect(progress.topics).toEqual([]);
    expect(progress.recentResults).toEqual([]);
  });

  it("serves a practice picture only to the child it belongs to, for keys the set uses", async () => {
    expect(await getPracticeAsset(otherChild, sessionId, "anything.png", ctx())).toBeNull();
    expect(await getPracticeAsset(child, sessionId, "not-in-this-set.png", ctx())).toBeNull();
  });

  // -------------------------------------------------------------------------
  it("gives the parent one sentence and one next action, with topic states in plain words", async () => {
    await markResultSeenByParent(parentA, mock.attemptId, ctx());
    const progress = await getParentProgress(parentA, ctx(at(3000)));
    if (progress.kind !== "ready") throw new Error("expected progress");
    expect(progress.childNickname).toBe("Darius");
    expect(progress.sentence).toMatch(/needs attention\.$|on track|improved/);
    expect(progress.sentence).not.toMatch(/%|master/i);
    expect(progress.action.href).not.toBe("");
    expect(progress.topics.length).toBeGreaterThan(0);
    for (const topic of progress.topics) {
      expect(["Not started", "Learning", "Getting there", "Almost there", "Secure", "Remembered"]).toContain(topic.word);
      expect(topic.href).toBe(`/progress/topics/${topic.topicId}`);
      expect(topic.evidence).toMatch(/^Based on \d+ questions? from \d+ sessions?$/);
    }
    expect(progress.recentResults).toHaveLength(1);
    expect(progress.trend).toEqual([]);
    // Blank answers are a pattern worth knowing about.
    expect(progress.patterns.map((pattern) => pattern.label)).toContain("Questions left blank");
    expect(progress.detail.length).toBe(progress.topics.length);
    expect(JSON.stringify(progress)).not.toMatch(/P3-[A-Z]{2}-/);
  });

  it("a topic page lists its skills in plain words with one action, and is only for topics that exist", async () => {
    const page = await getParentTopicProgress(parentA, topicId, ctx(at(3000)));
    expect(page).not.toBeNull();
    expect(page!.outcomes.length).toBeGreaterThan(0);
    expect(page!.suggest.href).toBe(`/progress/practice?topic=${encodeURIComponent(topicId)}`);
    expect(page!.suggest.ctaLabel).toBe(`Suggest ${page!.label} practice to Darius`);
    expect(await getParentTopicProgress(parentA, "00000000-0000-4000-8000-000000000999", ctx())).toBeNull();
    expect(await getParentTopicProgress(parentA, "nope", ctx())).toBeNull();
  });

  it("Home offers practice for the weak topic, and Progress and Home agree on which", async () => {
    const home = await getParentHome(parentA, ctx(at(3000)));
    expect(["start_practice", "done_today", "generate_next_mock", "final_mock"]).toContain(home.action.kind);
  });

  // -------------------------------------------------------------------------
  it("'Suggest to Darius' pins the topic as his next mission until he starts it", async () => {
    const map = await getLearningMap(child.childId, { db, now: at(3000) });
    const target = map!.topics.find((topic) => topic.topicId !== topicId)!;
    const suggested = await suggestPractice(parentA, child.childId, target.topicId, ctx(at(3000)));
    expect(suggested).toEqual({ topicLabel: target.label, created: true });
    // Suggesting the same thing twice says nothing new.
    expect(await suggestPractice(parentA, child.childId, target.topicId, ctx(at(3001)))).toEqual({ topicLabel: target.label, created: false });
    expect(await db.select().from(practiceSuggestions)).toHaveLength(1);

    const today = (await getChildToday(child, ctx(at(3100)))).action;
    expect(today).toMatchObject({ kind: "start_practice", title: `Practise ${target.label}`, practiceTopicId: target.topicId });
    expect(today.supportingText).toContain("Your grown-up picked this for you");
    const suggestion = await getParentPracticeSuggestion(parentA, target.topicId, ctx(at(3100)));
    expect(suggestion).toMatchObject({ childNickname: "Darius", topicLabel: target.label, alreadySuggested: true });
    expect((await getParentHome(parentA, ctx(at(3100)))).action.title).toBe(`${target.label} practice is ready for Darius`);

    // A different suggestion replaces the waiting one.
    const replacement = map!.topics.find((topic) => topic.topicId !== topicId && topic.topicId !== target.topicId)!;
    await suggestPractice(parentA, child.childId, replacement.topicId, ctx(at(3200)));
    const rows = await db.select().from(practiceSuggestions);
    expect(rows.map((row) => row.status).sort()).toEqual(["pending", "replaced"]);

    // Starting it (from Today's button) begins that topic and uses the suggestion up.
    const started = await startRecommendedPractice(child, ctx(at(3300)));
    const [session] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, started.sessionId));
    expect(session).toMatchObject({ topicId: replacement.topicId, origin: "suggested" });
    expect((await db.select().from(practiceSuggestions)).map((row) => row.status).sort()).toEqual(["replaced", "started"]);
    const after = (await getChildToday(child, ctx(at(3310)))).action;
    expect(after.kind).toBe("resume_practice");
  });

  it("a parent can only suggest for their own child, and only for a topic that exists", async () => {
    const map = await getLearningMap(child.childId, { db, now: at(3400) });
    const topic = map!.topics[0]!.topicId;
    await expect(suggestPractice(parentB, child.childId, topic, ctx(at(3400)))).rejects.toBeInstanceOf(NotFoundError);
    await expect(suggestPractice(parentA, otherChild.childId, topic, ctx(at(3400)))).rejects.toBeInstanceOf(NotFoundError);
    await expect(suggestPractice(parentA, child.childId, "00000000-0000-4000-8000-000000000999", ctx(at(3400)))).rejects.toBeInstanceOf(NotFoundError);
    await expect(suggestPractice(parentA, "not-a-uuid", topic, ctx(at(3400)))).rejects.toBeInstanceOf(NotFoundError);
    expect(await getParentProgress(parentB, ctx())).toMatchObject({ kind: "empty" });
    void siblingId;
  });

  // -------------------------------------------------------------------------
  it("a mistake can be tried again as one question on the same skill from another family", async () => {
    // Finish the open set first: one unfinished set per child.
    const open = (await db.select().from(practiceSessions).where(and(eq(practiceSessions.status, "in_progress"), eq(practiceSessions.childId, child.childId))))[0]!;
    let clock = 4000;
    for (const item of await listPracticeItems(db, open.id)) {
      clock += 20;
      await answerPracticeQuestion(child, open.id, item.response.position, answerOf(item, true), ctx(at(clock)));
    }
    await finishPractice(child, open.id, ctx(at(clock + 5)));

    const paper = await getMarkedPaper({ kind: "child", childId: child.childId }, mock.attemptId, ctx());
    const mistake = paper!.entries.find((entry) => entry.mistake)!;
    expect(mistake.outcomeId).not.toBe("");
    expect(mistake.tryHref).toBe(`/practice?outcome=${encodeURIComponent(mistake.outcomeId)}`);
    const started = await startPractice(child, { kind: "outcome", outcomeId: mistake.outcomeId }, { origin: "similar", count: 1, like: mistake.questionId }, ctx(at(clock + 100)));
    const items = await listPracticeItems(db, started.sessionId);
    expect(items).toHaveLength(1);
    expect(items[0]!.question.id).not.toBe(mistake.questionId);
    expect(items[0]!.question.familyId).not.toBe((await db.select().from(masteryEvidence).where(eq(masteryEvidence.questionId, mistake.questionId)))[0]!.familyId);
    expect(items[0]!.response.outcomeId).toBe(mistake.outcomeId);
    const answered = await answerPracticeQuestion(child, started.sessionId, 1, answerOf(items[0]!, true), ctx(at(clock + 120)));
    expect(answered.isLast).toBe(true);
    const finished = await finishPractice(child, started.sessionId, ctx(at(clock + 125)));
    expect(finished.minutes).toBeGreaterThanOrEqual(1);
  });

  it("Practice lists what to do in order: recommended, mistakes, topics to work on, browse", async () => {
    const home = await getPracticeHome(child, {}, ctx(at(6000)));
    expect(home.primary?.kind).toBe("start");
    expect(home.requested).toBeNull();
    // Mistakes were gone through earlier in this file, so none are listed.
    expect(home.mistakes).toEqual([]);
    const shown = new Set<string>();
    for (const card of [...home.toWorkOn, ...home.browse]) {
      expect(shown.has(card.topicId)).toBe(false);
      shown.add(card.topicId);
      expect(card.stars).toBeGreaterThanOrEqual(0);
      expect(card.stars).toBeLessThanOrEqual(4);
    }
    expect(home.toWorkOn.length).toBeLessThanOrEqual(3);
    const requested = await getPracticeHome(child, { outcome: (await getLearningMap(child.childId, { db, now: at(6000) }))!.topics[0]!.testable[0]!.outcomeId }, ctx(at(6000)));
    expect(requested.requested).not.toBeNull();
    expect(requested.primary).toMatchObject({ kind: "start", title: "Try one like this" });
  });

  it("the child's Progress is a map of stars with no numbers, and their mistakes are one tap away", async () => {
    const progress = await getChildProgress(child, ctx(at(6000)));
    expect(progress.topics.length).toBeGreaterThan(0);
    for (const topic of progress.topics) {
      expect(topic.stars).toBeGreaterThanOrEqual(1);
      expect(topic.word).not.toMatch(/master/i);
    }
    expect(progress.recentResults).toHaveLength(1);
    expect(progress.mistakes).toBeNull();
  });
});
