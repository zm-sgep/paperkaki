import { describe, expect, it } from "vitest";
import { topicsNeedingAttention, type TopicRow } from "@/domain/marking/result-summary";
import { practiceOutcomesFromTopics, weakestWeakOutcome } from "@/domain/recommendations";

const row = (topicId: string, label: string, marks: number, maxMarks: number): TopicRow => ({
  topicId,
  label,
  marks,
  maxMarks,
  marksLost: maxMarks - marks,
  status: marks / maxMarks < 0.5 ? "needs_attention" : "strong",
  statusText: "",
});

describe("the results page recommendation", () => {
  it("practises the topic listed first under What needs attention, even when two topics both scored nothing", () => {
    // Both topics scored 0. The list puts the one that lost more marks first; so must the button,
    // whatever order the topic ids happen to sort in.
    const rows = [row("a-fractions", "Fractions", 0, 17), row("b-adding", "Adding and subtracting bigger numbers", 0, 18), row("c-whole", "Whole numbers to 10 000", 2, 15)];
    const listedFirst = topicsNeedingAttention(rows)[0];
    expect(listedFirst?.label).toBe("Adding and subtracting bigger numbers");
    const target = weakestWeakOutcome(practiceOutcomesFromTopics(rows, "2026-09-30T10:00:00.000Z"));
    expect(target?.name).toBe(listedFirst?.label);
  });
});
