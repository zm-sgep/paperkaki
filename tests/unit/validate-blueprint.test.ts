import { describe, expect, it } from "vitest";
import {
  buildBlueprint,
  canFormSum,
  explainForParent,
  hasBannedParentWording,
  validateBlueprint,
  type Blueprint,
  type DifficultyLevel,
  type Issue,
  type IssueCode,
  type SectionInventory,
  type TopicInventory,
} from "@/domain/assessments";

const LABELS = ["Fractions", "Angles", "Time", "Money"];

function blueprint(
  topicCount: number,
  totalMarks: number,
  opts: { durationMinutes?: number; difficulty?: DifficultyLevel } = {},
): Blueprint {
  return buildBlueprint({
    curriculumVersionId: "cv-test",
    level: "P3",
    subject: "Mathematics",
    topics: Array.from({ length: topicCount }, (_, i) => ({
      topicId: `T${i + 1}`,
      label: LABELS[i] ?? `Topic ${i + 1}`,
      outcomeIds: [`T${i + 1}-01`],
    })),
    settings: {
      totalMarks,
      durationMinutes: opts.durationMinutes ?? totalMarks + 5,
      difficulty: opts.difficulty ?? "balanced",
    },
  });
}

const section = (marks: number[]): SectionInventory => ({
  count: marks.length,
  totalMarks: marks.reduce((a, b) => a + b, 0),
  marksMultiset: marks,
});

/** Plenty of 1, 2 and 3 mark questions in both sections. */
const rich = (topicId: string): TopicInventory => ({
  topicId,
  sectionA: section([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2]),
  sectionB: section([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3]),
});

const richFor = (n: number): TopicInventory[] => Array.from({ length: n }, (_, i) => rich(`T${i + 1}`));

const codes = (issues: Issue[]): IssueCode[] => issues.map((i) => i.code);

describe("validateBlueprint", () => {
  it("accepts a sensible paper with no errors or warnings", () => {
    const r = validateBlueprint(blueprint(3, 40, { durationMinutes: 45 }), richFor(3));
    expect(r).toEqual({ errors: [], warnings: [] });
  });

  it("reports marks_out_of_range", () => {
    for (const total of [5, 12, 65]) {
      const r = validateBlueprint(blueprint(1, total, { durationMinutes: 30 }), richFor(1));
      expect(codes(r.errors)).toContain("marks_out_of_range");
    }
  });

  it("reports duration_out_of_range", () => {
    for (const minutes of [10, 130]) {
      const r = validateBlueprint(blueprint(2, 30, { durationMinutes: minutes }), richFor(2));
      expect(codes(r.errors)).toContain("duration_out_of_range");
    }
  });

  it("reports no_topics", () => {
    const r = validateBlueprint(blueprint(0, 30), []);
    expect(codes(r.errors)).toEqual(["no_topics"]);
  });

  it("reports too_few_marks_for_topics with a usable number, and does not throw", () => {
    const r = validateBlueprint(blueprint(11, 10), richFor(11));
    const issue = r.errors.find((e) => e.code === "too_few_marks_for_topics");
    expect(issue?.message).toBe("Choose at least 15 marks so every topic gets a question.");
  });

  it("reports difficulty_invalid when the mix does not sum to 100", () => {
    const bp = blueprint(2, 30);
    const bad: Blueprint = { ...bp, difficulty: { basic: 50, standard: 50, challenging: 50 } };
    expect(codes(validateBlueprint(bad, richFor(2)).errors)).toContain("difficulty_invalid");
  });

  it("reports topic_has_no_questions by topic", () => {
    const inv = [rich("T1"), { topicId: "T2", sectionA: section([]), sectionB: section([]) }];
    const r = validateBlueprint(blueprint(3, 30), inv);
    const missing = r.errors.filter((e) => e.code === "topic_has_no_questions");
    expect(missing.map((e) => e.topicId)).toEqual(["T2", "T3"]);
    expect(missing[0]?.message).toContain("We don't have questions for Angles yet.");
  });

  it("reports insufficient_inventory with a way forward", () => {
    // Fractions: 20 marks needs 15 written-answer marks but only 12 exist; 15 marks needs 11.
    const inv = [{ topicId: "T1", sectionA: section([1, 1, 1, 1, 1]), sectionB: section(Array(12).fill(1)) }];
    const r = validateBlueprint(blueprint(1, 20, { durationMinutes: 25 }), inv);
    const issue = r.errors.find((e) => e.code === "insufficient_inventory");
    expect(issue?.topicId).toBe("T1");
    expect(issue?.message).toMatch(/^We don't have enough Fractions questions for 20 marks\. Try 15 marks in total, or add another topic\.$/);
  });

  it("falls back to 'add another topic' when no other total works", () => {
    const inv = [{ topicId: "T1", sectionA: section([1]), sectionB: section([1]) }];
    const r = validateBlueprint(blueprint(1, 20, { durationMinutes: 25 }), inv);
    const issue = r.errors.find((e) => e.code === "insufficient_inventory");
    expect(issue?.message).toBe(
      "We don't have enough Fractions questions for 20 marks. Try adding another topic.",
    );
  });

  it("flags a section that has questions but not enough of them", () => {
    // Needs 5 multiple-choice marks; only 2 available. Written answers plentiful.
    const inv = [{ topicId: "T1", sectionA: section([1, 1]), sectionB: section(Array(20).fill(1)) }];
    const r = validateBlueprint(blueprint(1, 20, { durationMinutes: 25 }), inv);
    expect(codes(r.errors)).toEqual(["insufficient_inventory"]);
  });

  it("reports section_marks_unreachable when enough marks exist but not the exact total", () => {
    // Section B needs 15 marks; only 2-mark and 4-mark questions exist (all even).
    const inv = [{ topicId: "T1", sectionA: section([1, 1, 1, 1, 1]), sectionB: section([2, 2, 2, 2, 4, 4, 4, 4]) }];
    const r = validateBlueprint(blueprint(1, 20, { durationMinutes: 25 }), inv);
    const issue = r.errors.find((e) => e.code === "section_marks_unreachable");
    expect(issue?.topicId).toBe("T1");
    expect(issue?.message).toContain("Fractions");
    expect(codes(r.errors)).not.toContain("insufficient_inventory");
  });

  it("warns duration_short and duration_long, without making them errors", () => {
    const short = validateBlueprint(blueprint(4, 60, { durationMinutes: 45 }), richFor(4));
    expect(codes(short.warnings)).toEqual(["duration_short"]);
    expect(short.warnings[0]?.message).toBe("45 minutes may be tight for 60 marks. Try 60 minutes or more.");
    expect(short.errors).toEqual([]);

    const long = validateBlueprint(blueprint(1, 10, { durationMinutes: 60 }), richFor(1));
    expect(codes(long.warnings)).toEqual(["duration_long"]);
    expect(long.errors).toEqual([]);
  });

  it("does not warn on the boundaries (1 and 2 minutes per mark)", () => {
    expect(validateBlueprint(blueprint(2, 30, { durationMinutes: 30 }), richFor(2)).warnings).toEqual([]);
    expect(validateBlueprint(blueprint(2, 30, { durationMinutes: 60 }), richFor(2)).warnings).toEqual([]);
  });

  it("never mutates the blueprint or inventory", () => {
    const bp = blueprint(3, 40);
    const inv = richFor(3);
    const before = JSON.stringify([bp, inv]);
    validateBlueprint(bp, inv);
    validateBlueprint(blueprint(1, 60), [{ topicId: "T1", sectionA: section([1]), sectionB: section([1]) }]);
    expect(JSON.stringify([bp, inv])).toBe(before);
  });

  it("is deterministic", () => {
    const bp = blueprint(2, 60);
    const inv = [rich("T1"), { topicId: "T2", sectionA: section([1]), sectionB: section([1]) }];
    expect(validateBlueprint(bp, inv)).toEqual(validateBlueprint(bp, inv));
  });
});

describe("canFormSum", () => {
  it("does subset-sum over a multiset", () => {
    expect(canFormSum([2, 2, 4], 6)).toBe(true);
    expect(canFormSum([2, 2, 4], 5)).toBe(false);
    expect(canFormSum([3], 6)).toBe(false);
    expect(canFormSum([], 0)).toBe(true);
    expect(canFormSum([1, 1, 1], 4)).toBe(false);
  });
});

describe("explainForParent", () => {
  // Letters A/B are case-sensitive: the article "a" is fine, a bare "A" or "B" is a code letter.
  const codeLetter = /(^|[^A-Za-z0-9'])[AB]([^A-Za-z0-9']|$)/;
  const bannedWords = /blueprint|outcome|inventory|percent|%|\bsections?\b/i;
  const leaks = (text: string): boolean => bannedWords.test(text) || codeLetter.test(text);

  function everyIssue(): Issue[] {
    const all: Issue[] = [];
    const push = (bp: Blueprint, inv: TopicInventory[]) => {
      const r = validateBlueprint(bp, inv);
      all.push(...r.errors, ...r.warnings);
    };
    push(blueprint(1, 65, { durationMinutes: 10 }), richFor(1));
    push(blueprint(0, 30), []);
    push(blueprint(11, 10), richFor(11));
    push({ ...blueprint(2, 30), difficulty: { basic: 1, standard: 1, challenging: 1 } }, richFor(2));
    push(blueprint(2, 30), [rich("T1")]);
    push(blueprint(1, 20, { durationMinutes: 25 }), [{ topicId: "T1", sectionA: section([1]), sectionB: section([1]) }]);
    push(blueprint(1, 20, { durationMinutes: 25 }), [
      { topicId: "T1", sectionA: section([1, 1, 1, 1, 1]), sectionB: section([2, 2, 2, 2, 4, 4, 4, 4]) },
    ]);
    push(blueprint(4, 60, { durationMinutes: 45 }), richFor(4));
    push(blueprint(1, 10, { durationMinutes: 60 }), richFor(1));
    return all;
  }

  it("covers every issue code in the fixtures", () => {
    const seen = new Set(everyIssue().map((i) => i.code));
    expect([...seen].sort()).toEqual(
      [
        "difficulty_invalid",
        "duration_long",
        "duration_out_of_range",
        "duration_short",
        "insufficient_inventory",
        "marks_out_of_range",
        "no_topics",
        "section_marks_unreachable",
        "too_few_marks_for_topics",
        "topic_has_no_questions",
      ].sort(),
    );
  });

  it("never produces banned words in any real message", () => {
    for (const issue of everyIssue()) {
      expect(leaks(issue.message), issue.message).toBe(false);
      expect(hasBannedParentWording(issue.message), issue.code).toBe(false);
    }
    for (const line of explainForParent(everyIssue())) expect(leaks(line), line).toBe(false);
  });

  it("replaces a message that leaks internal wording with a safe line", () => {
    const leaky: Issue[] = [
      { code: "insufficient_inventory", message: "Blueprint inventory too small for outcome P3-NA-FR-01 (Section A, 40%)." },
      { code: "duration_short", message: "Section B needs 30 percent more time." },
    ];
    const lines = explainForParent(leaky);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(leaks(line), line).toBe(false);
      expect(line.length).toBeGreaterThan(10);
    }
  });

  it("removes duplicate lines and keeps order", () => {
    const a: Issue = { code: "no_topics", message: "Choose at least one topic for the mock." };
    const b: Issue = { code: "marks_out_of_range", message: "Choose between 10 and 60 marks, in steps of 5." };
    expect(explainForParent([a, b, a])).toEqual([a.message, b.message]);
    expect(explainForParent([])).toEqual([]);
  });

  it("detects banned wording in the detector itself", () => {
    for (const bad of ["The blueprint is ready", "3 outcomes", "inventory", "50%", "40 percent", "Section A", "part B here", "Pick A or B"]) {
      expect(hasBannedParentWording(bad), bad).toBe(true);
    }
    for (const ok of ["Choose 20 marks.", "Try a different topic.", "Ask a friend about Angles."]) {
      expect(hasBannedParentWording(ok), ok).toBe(false);
    }
  });
});
