import { describe, expect, it } from "vitest";
import {
  changeFromPrevious,
  childHeadline,
  orderForReview,
  overTimeText,
  scoreText,
  thingsToLearn,
  topicBreakdown,
  topicsNeedingAttention,
  type ResultQuestion,
} from "@/domain/marking";
import { practiceOutcomesFromTopics, resultNextAction, nextParentAction, type ParentActionState } from "@/domain/recommendations";

let n = 0;
function q(position: number, marks: number, score: number, topic: string, skill = `${topic} skill`): ResultQuestion {
  n += 1;
  return { questionId: `q${n}`, position, marks, score, topicId: `t-${topic}`, topicLabel: topic, skillLabel: skill };
}

describe("what changed since the previous mock", () => {
  const now = { score: 38, maxScore: 50 };
  it("says how many marks up or down from the previous marked mock", () => {
    expect(changeFromPrevious(now, { score: 32, maxScore: 50, mockNumber: 1 })).toEqual({ kind: "up", text: "Up 6 marks from Mock 1" });
    expect(changeFromPrevious(now, { score: 37, maxScore: 50, mockNumber: 2 }).text).toBe("Up 1 mark from Mock 2");
    expect(changeFromPrevious(now, { score: 41, maxScore: 50, mockNumber: 1 })).toEqual({ kind: "down", text: "Down 3 marks from Mock 1" });
    expect(changeFromPrevious(now, { score: 38, maxScore: 50, mockNumber: 1 })).toEqual({ kind: "same", text: "The same as Mock 1" });
  });

  it("makes the first mock a starting point, not a comparison", () => {
    expect(changeFromPrevious(now, undefined)).toEqual({ kind: "first", text: "First mock — this is your starting point" });
  });

  it("does not compare marks across papers with different totals", () => {
    const change = changeFromPrevious(now, { score: 30, maxScore: 40, mockNumber: 1 });
    expect(change.kind).toBe("different_total");
    expect(change.text).not.toMatch(/%|up|down/i);
  });

  it("writes the score and the time over as plain notes", () => {
    expect(scoreText(38, 50)).toBe("38/50");
    expect(overTimeText(0)).toBeNull();
    expect(overTimeText(30)).toBe("Finished less than a minute over time");
    expect(overTimeText(240)).toBe("Finished 4 minutes over time");
    expect(overTimeText(65)).toBe("Finished 1 minute over time");
  });
});

describe("topic breakdown and what needs attention", () => {
  const paper = [
    q(1, 1, 1, "Fractions"),
    q(2, 2, 2, "Fractions"),
    q(3, 2, 0, "Length"),
    q(4, 3, 1, "Length"),
    q(5, 2, 2, "Time"),
    q(6, 4, 1, "Money"),
    q(7, 1, 0, "Angles"),
    q(8, 1, 1, "Angles"),
  ];

  it("sums marks per topic with plain status words, the biggest loss first", () => {
    const rows = topicBreakdown(paper);
    expect(rows.map((r) => [r.label, `${r.marks}/${r.maxMarks}`, r.statusText])).toEqual([
      ["Length", "1/5", "Needs attention"],
      ["Money", "1/4", "Needs attention"],
      ["Angles", "1/2", "Needs attention"],
      ["Fractions", "3/3", "Strong"],
      ["Time", "2/2", "Strong"],
    ]);
  });

  it("names one to three topics, most marks lost first, and never more than three", () => {
    const rows = topicBreakdown(paper);
    expect(topicsNeedingAttention(rows).map((r) => r.label)).toEqual(["Length", "Money", "Angles"]);
    const many = topicBreakdown([...paper, q(9, 3, 0, "Area"), q(10, 3, 0, "Graphs")]);
    expect(topicsNeedingAttention(many)).toHaveLength(3);
  });

  it("still names the topic that lost the most when nothing is below the line, and none for full marks", () => {
    const close = topicBreakdown([q(1, 10, 9, "Fractions"), q(2, 10, 10, "Length")]);
    expect(topicsNeedingAttention(close).map((r) => r.label)).toEqual(["Fractions"]);
    expect(topicsNeedingAttention(topicBreakdown([q(1, 2, 2, "Fractions")]))).toEqual([]);
  });

  it("breaks ties between topics by ratio and then name, the same way every time", () => {
    const rows = topicBreakdown([q(1, 2, 0, "B topic"), q(2, 2, 0, "A topic")]);
    expect(rows.map((r) => r.label)).toEqual(["A topic", "B topic"]);
  });
});

describe("the marked paper's order and the child's summary", () => {
  const paper = [q(1, 1, 1, "A"), q(2, 3, 0, "B", "Skill B"), q(3, 2, 1, "C", "Skill C"), q(4, 4, 4, "A"), q(5, 2, 0, "D", "Skill D"), q(6, 2, 0, "E", "Skill E")];

  it("puts mistakes first, the costliest first, then what was right in paper order", () => {
    expect(orderForReview(paper).map((x) => x.position)).toEqual([2, 5, 6, 3, 1, 4]);
  });

  it("names up to three skills to learn, in the child's words", () => {
    expect(thingsToLearn(paper)).toEqual(["Skill B", "Skill D", "Skill E"]);
    expect(thingsToLearn([q(1, 2, 2, "A")])).toEqual([]);
  });

  it("is warm, has no comparison and no ability label", () => {
    expect(childHeadline({ score: 38, maxScore: 50, mistakeCount: 3 })).toBe("Great effort! Let's fix 3 mistakes.");
    expect(childHeadline({ score: 49, maxScore: 50, mistakeCount: 1 })).toBe("Fantastic work! Let's fix 1 mistake.");
    expect(childHeadline({ score: 50, maxScore: 50, mistakeCount: 0 })).toBe("Fantastic work! There is nothing to fix this time.");
    for (const score of [0, 10, 20, 30, 50]) {
      const text = childHeadline({ score, maxScore: 50, mistakeCount: 2 });
      expect(text).not.toMatch(/rank|level|weak|bad|behind|other|average|\d+\/\d+|%/i);
    }
  });
});

describe("the one recommended next action after a mock", () => {
  const state = (rows: ReturnType<typeof topicBreakdown>): ParentActionState => ({
    children: [{ id: "c", nickname: "Mia" }],
    assessments: [{ id: "a1", childId: "c", name: "WA2", subject: "Mathematics", date: "2026-10-14", scopeConfirmed: true, papers: [{ id: "p1", number: 1, status: "ready" }] }],
    today: "2026-09-30",
    attempts: [{ id: "r1", childId: "c", paperId: "p1", status: "marked", startedAt: "2026-09-30T01:00:00Z", resultId: "r1", resultSeen: true, unreviewedMistakes: 0 }],
    practice: { outcomes: practiceOutcomesFromTopics(rows, "2026-09-30T01:00:00Z"), sessionsSinceLastMock: 0, minutesToday: 0 },
  });

  it("recommends 15-minute practice on the weakest topic", () => {
    const action = resultNextAction(state(topicBreakdown([q(1, 4, 1, "Length"), q(2, 2, 2, "Fractions")])), "a1");
    expect(action).toMatchObject({ kind: "start_practice", ctaLabel: "Start 15-minute Length practice" });
  });

  it("recommends the next mock when nothing needs practice", () => {
    const rows = topicBreakdown([q(1, 4, 4, "Length")]);
    expect(nextParentAction(state(rows)).kind).toBe("done_today");
    expect(resultNextAction(state(rows), "a1")).toMatchObject({ kind: "generate_next_mock", ctaLabel: "Get the next mock", href: "/prepare/a1" });
  });

  it("turns topics into practice areas without inventing any", () => {
    const outcomes = practiceOutcomesFromTopics(topicBreakdown([q(1, 5, 1, "Length"), q(2, 5, 3, "Time"), q(3, 5, 4, "Money"), q(4, 5, 5, "Fractions")]), "2026-09-30T01:00:00Z");
    expect(outcomes.map((o) => [o.name, o.state])).toEqual([
      ["Length", "learning"],
      ["Time", "developing"],
      ["Money", "almost_mastered"],
      ["Fractions", "mastered"],
    ]);
  });
});
