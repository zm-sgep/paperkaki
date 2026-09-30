import { describe, expect, it } from "vitest";
import {
  END_OF_YEAR_COMMON_FORMAT,
  adaptiveFocusText,
  blueprintSections,
  buildBlueprint,
  formatQuestionCount,
  questionKindOf,
  type Blueprint,
} from "@/domain/assessments";
import {
  FOCUS_RATIO,
  MIN_SHARE_OF_EVEN,
  OUTCOME_BOOST,
  TOPIC_WEIGHT,
  adaptiveFocus,
  applyFocus,
  selectQuestions,
  shareByWeight,
  type FocusOutcome,
  type SelectionResult,
} from "@/domain/papers";
import type { MasteryState } from "@/domain/mastery";
import { BANK_CANDIDATES, BANK_TOPICS } from "../helpers/question-bank";

const NOW = "2026-10-20T02:00:00.000Z";

/** A topic's state is that of its skills (the tests give every skill of a topic the same state). */
function focusOf(input: { scope: { topicId: string; outcomeIds: string[] }[]; totalMarks: number; outcomes: FocusOutcome[]; now: string }) {
  const topics = input.scope.map((item) => ({ topicId: item.topicId, state: input.outcomes.find((outcome) => outcome.topicId === item.topicId)?.state ?? ("not_started" as MasteryState) }));
  return adaptiveFocus({ ...input, topics });
}

function scopeOf(topicCount: number) {
  return BANK_TOPICS.slice(0, topicCount).map((topic) => ({ topicId: topic.topicId, outcomeIds: topic.outcomeIds }));
}

/** Every skill of a topic in the same state. */
function inState(topicIndex: number, state: MasteryState, extra: Partial<FocusOutcome> = {}): FocusOutcome[] {
  const topic = BANK_TOPICS[topicIndex]!;
  return topic.outcomeIds.map((outcomeId) => ({ outcomeId, topicId: topic.topicId, state, ...extra }));
}

describe("sharing marks by weight", () => {
  it("always adds up exactly, with ties broken the same way every time", () => {
    for (const total of [10, 37, 50, 60]) {
      const weights = [1, 1.7, 0.75, 1.1, 1.45].map((weight, index) => ({ id: `t${index}`, weight }));
      const shares = shareByWeight(total, weights);
      expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(total);
      expect(shareByWeight(total, weights)).toEqual(shares);
    }
    expect(shareByWeight(10, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 1 }])).toEqual({ a: 4, b: 3, c: 3 });
  });
});

describe("adaptive focus for a later mock (M10)", () => {
  const scope = scopeOf(5);
  const total = 50;

  it("shares the marks evenly when nothing is known", () => {
    const focus = focusOf({ scope, totalMarks: total, outcomes: [], now: NOW });
    expect(Object.values(focus.targets)).toEqual([10, 10, 10, 10, 10]);
    expect(focus.focusTopicIds).toEqual([]);
    expect(focus.dueOutcomeIds).toEqual([]);
    expect(focus.outcomeBoost).toEqual({});
  });

  it("moves marks towards the weak topics and away from the secure ones, and the total never changes", () => {
    const outcomes = [...inState(0, "learning"), ...inState(1, "developing"), ...inState(2, "almost_mastered"), ...inState(3, "mastered"), ...inState(4, "not_started")];
    const focus = focusOf({ scope, totalMarks: total, outcomes, now: NOW });
    const marks = scope.map((item) => focus.targets[item.topicId] as number);
    expect(marks.reduce((a, b) => a + b, 0)).toBe(total);
    expect(marks[0]).toBeGreaterThan(marks[1]!);
    expect(marks[1]).toBeGreaterThan(marks[2]!);
    expect(marks[2]).toBeGreaterThanOrEqual(marks[4]!);
    expect(marks[4]).toBeGreaterThan(marks[3]!);
    expect(marks[0]).toBeGreaterThan(10);
    expect(marks[3]).toBeLessThan(10);
    // Only the topic that gets clearly more than an even share is named: 'getting there' gets a nudge, not a focus.
    expect(focus.focusTopicIds).toEqual([scope[0]!.topicId]);
  });

  it("is soft: no topic is ever left with less than half an even share, however lopsided the evidence is", () => {
    const outcomes = [...inState(0, "learning"), ...inState(1, "learning"), ...inState(2, "learning"), ...inState(3, "learning"), ...inState(4, "retained")];
    const focus = focusOf({ scope, totalMarks: total, outcomes, now: NOW });
    const floor = Math.floor(10 * MIN_SHARE_OF_EVEN);
    for (const item of scope) expect(focus.targets[item.topicId]).toBeGreaterThanOrEqual(floor);
    expect(Object.values(focus.targets).reduce((a, b) => a + b, 0)).toBe(total);
    // The weights themselves are modest: the weakest asks for less than twice a secure one's share... of the even split.
    expect(TOPIC_WEIGHT.learning / TOPIC_WEIGHT.retained).toBeLessThan(3);
  });

  it("gives a topic with a review due a small lift and prefers that skill's questions (retention)", () => {
    const due = "2026-10-01T00:00:00.000Z";
    const notDue = "2026-11-30T00:00:00.000Z";
    const withDue = focusOf({ scope: scope.slice(0, 2), totalMarks: 40, outcomes: [...inState(0, "mastered", { reviewDueAt: due }), ...inState(1, "mastered", { reviewDueAt: notDue })], now: NOW });
    expect(withDue.targets[scope[0]!.topicId]).toBeGreaterThan(withDue.targets[scope[1]!.topicId]!);
    expect(withDue.dueOutcomeIds.length).toBe(BANK_TOPICS[0]!.outcomeIds.length);
    for (const id of withDue.dueOutcomeIds) expect(withDue.outcomeBoost[id]).toBe(OUTCOME_BOOST.due);
    const notDueAtAll = focusOf({ scope: scope.slice(0, 2), totalMarks: 40, outcomes: [...inState(0, "mastered", { reviewDueAt: notDue }), ...inState(1, "mastered", { reviewDueAt: notDue })], now: NOW });
    expect(notDueAtAll.dueOutcomeIds).toEqual([]);
  });

  it("prefers the weak skills' questions inside a topic", () => {
    const topic = BANK_TOPICS[0]!;
    const [weak, ...rest] = topic.outcomeIds;
    const outcomes: FocusOutcome[] = [
      { outcomeId: weak!, topicId: topic.topicId, state: "learning" },
      ...rest.map((outcomeId) => ({ outcomeId, topicId: topic.topicId, state: "almost_mastered" as const })),
    ];
    const focus = focusOf({ scope: [{ topicId: topic.topicId, outcomeIds: topic.outcomeIds }], totalMarks: 10, outcomes, now: NOW });
    expect(focus.outcomeBoost).toEqual({ [weak!]: OUTCOME_BOOST.weak });
  });

  it("names at most two focus topics, and only those that get clearly more than an even share", () => {
    const outcomes = [...inState(0, "learning"), ...inState(1, "learning"), ...inState(2, "learning"), ...inState(3, "almost_mastered"), ...inState(4, "almost_mastered")];
    const focus = focusOf({ scope, totalMarks: total, outcomes, now: NOW });
    expect(focus.focusTopicIds).toHaveLength(2);
    for (const id of focus.focusTopicIds) expect(focus.targets[id]).toBeGreaterThanOrEqual(10 * FOCUS_RATIO);
    // Nothing is above an even share when every topic is in the same state.
    const same = focusOf({ scope, totalMarks: total, outcomes: scope.flatMap((_, i) => inState(i, "developing")), now: NOW });
    expect(same.focusTopicIds).toEqual([]);
  });

  it("is deterministic, and applying it changes only the target marks", () => {
    const outcomes = [...inState(0, "learning"), ...inState(1, "mastered")];
    const a = focusOf({ scope, totalMarks: total, outcomes, now: NOW });
    expect(focusOf({ scope, totalMarks: total, outcomes: [...outcomes].reverse(), now: NOW })).toEqual(a);
    const items = scope.map((item) => ({ ...item, label: "x", targetMarks: 10 }));
    const applied = applyFocus(items, a);
    expect(applied.map((item) => item.topicId)).toEqual(items.map((item) => item.topicId));
    expect(applied.map((item) => item.outcomeIds)).toEqual(items.map((item) => item.outcomeIds));
    expect(applied.reduce((sum, item) => sum + item.targetMarks, 0)).toBe(total);
    expect(items.every((item) => item.targetMarks === 10)).toBe(true);
  });

  it("says it in the parent's words, and stays quiet when nothing stands out", () => {
    expect(adaptiveFocusText(2, ["Length", "Time"])).toBe("Mock 2 will focus a little more on Length and Time, and still cover every topic.");
    expect(adaptiveFocusText(3, ["Fractions"])).toBe("Mock 3 will focus a little more on Fractions, and still cover every topic.");
    expect(adaptiveFocusText(2, [])).toBeNull();
    expect(adaptiveFocusText(1, ["Length"])).toBeNull();
  });
});

describe("the selector with an adaptive blueprint keeps every hard rule", () => {
  function blueprintFor(topicCount: number): Blueprint {
    return buildBlueprint({
      curriculumVersionId: "v",
      level: "P3",
      subject: "Mathematics",
      topics: BANK_TOPICS.slice(0, topicCount),
      settings: { totalMarks: 50, durationMinutes: 90, difficulty: "balanced" },
      format: END_OF_YEAR_COMMON_FORMAT,
    });
  }

  function expectHardRules(bp: Blueprint, result: SelectionResult): void {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = new Map(BANK_CANDIDATES.map((c) => [c.questionId, c]));
    const ids = result.selection.map((q) => q.questionId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids.map((id) => byId.get(id)?.familyId)).size).toBe(ids.length);
    expect(result.selection).toHaveLength(formatQuestionCount(bp.format));
    expect(result.report.totalMarks).toBe(bp.totalMarks);
    for (const section of blueprintSections(bp)) {
      const chosen = result.selection.filter((q) => q.sectionCode === section.code);
      expect(chosen).toHaveLength(section.questionCount);
      expect(chosen.reduce((sum, q) => sum + q.marks, 0)).toBe(section.totalMarks);
      for (const q of chosen) expect(questionKindOf(byId.get(q.questionId)!)).toBe(section.kind);
    }
    const present = new Set(result.selection.map((q) => q.topicId));
    for (const item of bp.scope) expect(present.has(item.topicId), `topic ${item.topicId} still on the paper`).toBe(true);
  }

  const topicCount = 5;
  const even = blueprintFor(topicCount);
  const scope = even.scope.map((item) => ({ topicId: item.topicId, outcomeIds: item.outcomeIds }));
  const outcomes = [...inState(0, "learning"), ...inState(1, "almost_mastered"), ...inState(2, "mastered"), ...inState(3, "almost_mastered"), ...inState(4, "almost_mastered")];
  const focus = focusOf({ scope, totalMarks: even.totalMarks, outcomes, now: NOW });
  const adaptive: Blueprint = { ...even, scope: applyFocus(even.scope, focus) };
  const weakTopic = even.scope[0]!.topicId;
  const secureTopic = even.scope[2]!.topicId;

  it("puts more marks on the weak topic than the balanced paper does, across seeds, and fewer on the secure one", () => {
    let weakEven = 0;
    let weakAdaptive = 0;
    let secureEven = 0;
    let secureAdaptive = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const a = selectQuestions({ blueprint: even, candidates: BANK_CANDIDATES, seed: `s${seed}` });
      const b = selectQuestions({ blueprint: adaptive, candidates: BANK_CANDIDATES, seed: `s${seed}`, outcomeBoost: focus.outcomeBoost, dueOutcomeIds: focus.dueOutcomeIds });
      expectHardRules(even, a);
      expectHardRules(adaptive, b);
      if (!a.ok || !b.ok) return;
      weakEven += a.report.marksByTopic[weakTopic] ?? 0;
      weakAdaptive += b.report.marksByTopic[weakTopic] ?? 0;
      secureEven += a.report.marksByTopic[secureTopic] ?? 0;
      secureAdaptive += b.report.marksByTopic[secureTopic] ?? 0;
      // The weak topic never gets fewer marks than on the balanced paper of the same seed.
      expect(b.report.marksByTopic[weakTopic] ?? 0).toBeGreaterThanOrEqual(a.report.marksByTopic[weakTopic] ?? 0);
    }
    expect(weakAdaptive).toBeGreaterThan(weakEven);
    expect(secureAdaptive).toBeLessThanOrEqual(secureEven);
  });

  it("still avoids questions from earlier mocks and still covers every topic when the weight is heavy", () => {
    const first = selectQuestions({ blueprint: adaptive, candidates: BANK_CANDIDATES, seed: "one", outcomeBoost: focus.outcomeBoost });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const avoid = first.selection.map((q) => q.questionId);
    const second = selectQuestions({ blueprint: adaptive, candidates: BANK_CANDIDATES, seed: "two", avoidQuestionIds: avoid, outcomeBoost: focus.outcomeBoost });
    expectHardRules(adaptive, second);
    if (second.ok) expect(second.report.usedAvoided).toBe(0);
  });

  it("includes a question from a skill due for review, when the paper has room for one", () => {
    const due = BANK_TOPICS[3]!.outcomeIds.slice(0, 2);
    for (let seed = 1; seed <= 4; seed += 1) {
      const result = selectQuestions({ blueprint: adaptive, candidates: BANK_CANDIDATES, seed: `due${seed}`, dueOutcomeIds: due, outcomeBoost: Object.fromEntries(due.map((id) => [id, OUTCOME_BOOST.due])) });
      expectHardRules(adaptive, result);
      if (!result.ok) continue;
      const byId = new Map(BANK_CANDIDATES.map((c) => [c.questionId, c]));
      const present = new Set(result.selection.map((q) => byId.get(q.questionId)!.primaryOutcomeId));
      expect(due.some((id) => present.has(id)), `seed ${seed}`).toBe(true);
    }
  });

  it("changes nothing when no preference is given: the same paper as before", () => {
    const plain = selectQuestions({ blueprint: even, candidates: BANK_CANDIDATES, seed: "same" });
    const explicit = selectQuestions({ blueprint: even, candidates: BANK_CANDIDATES, seed: "same", outcomeBoost: {}, dueOutcomeIds: [] });
    expect(explicit).toEqual(plain);
  });
});
