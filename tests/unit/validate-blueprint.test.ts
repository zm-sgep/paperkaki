import { describe, expect, it } from "vitest";
import {
  END_OF_YEAR_COMMON_FORMAT,
  buildBlueprint,
  canFormCountAndSum,
  canFormSum,
  explainForParent,
  hasBannedParentWording,
  validateBlueprint,
  type Blueprint,
  type DifficultyLevel,
  type FormatSection,
  type Issue,
  type IssueCode,
  type PaperFormat,
  type PaperInventory,
  type SectionInventory,
} from "@/domain/assessments";

const LABELS = ["Fractions", "Angles", "Time", "Money"];

function blueprint(
  topicCount: number,
  totalMarks: number,
  opts: { durationMinutes?: number; difficulty?: DifficultyLevel; format?: PaperFormat } = {},
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
    format: opts.format,
  });
}

const supply = (marks: number[]): SectionInventory => ({
  count: marks.length,
  totalMarks: marks.reduce((a, b) => a + b, 0),
  marksMultiset: marks,
});

const ones = (n: number): number[] => Array<number>(n).fill(1);

/** Plenty of questions for every part of the standard mock, for n topics. */
function richInventory(bp: Blueprint, topicCount = bp.scope.length): PaperInventory {
  return {
    sections: bp.format.sections.map((s) =>
      supply(s.kind === "mcq" ? [...ones(40), 2, 2, 2, 2, 2, 2, 2, 2] : s.kind === "short" ? [...ones(40), ...Array<number>(40).fill(2)] : Array<number>(20).fill(3)),
    ),
    topics: Array.from({ length: topicCount }, (_, i) => ({ topicId: `T${i + 1}`, questionCount: 30 })),
  };
}

const codes = (issues: Issue[]): IssueCode[] => issues.map((i) => i.code);

describe("validateBlueprint", () => {
  it("accepts a sensible paper with no errors or warnings", () => {
    const bp = blueprint(3, 40, { durationMinutes: 45 });
    expect(validateBlueprint(bp, richInventory(bp))).toEqual({ errors: [], warnings: [] });
  });

  it("accepts the common end-of-year format when the bank is rich enough", () => {
    const bp = blueprint(5, 40, { format: END_OF_YEAR_COMMON_FORMAT });
    expect(validateBlueprint(bp, richInventory(bp))).toEqual({ errors: [], warnings: [] });
  });

  it("reports marks_out_of_range", () => {
    for (const total of [5, 65]) {
      const bp = blueprint(1, total, { durationMinutes: 30 });
      expect(codes(validateBlueprint(bp, richInventory(bp)).errors)).toContain("marks_out_of_range");
    }
  });

  it("reports duration_out_of_range", () => {
    for (const minutes of [10, 130]) {
      const bp = blueprint(2, 30, { durationMinutes: minutes });
      expect(codes(validateBlueprint(bp, richInventory(bp)).errors)).toContain("duration_out_of_range");
    }
  });

  it("reports no_topics", () => {
    const bp = blueprint(0, 30);
    expect(codes(validateBlueprint(bp, { sections: [], topics: [] }).errors)).toEqual(["no_topics"]);
  });

  it("reports a format whose parts do not add up, in plain words, next to the part", () => {
    const format: PaperFormat = {
      durationMinutes: 60,
      sections: [
        { label: "Section A", kind: "mcq", questionCount: 6, totalMarks: 12, marksEach: 2 },
        { label: "Section B", kind: "short", questionCount: 16, totalMarks: 40 },
      ],
    };
    const bp = blueprint(2, 40, { format });
    const r = validateBlueprint(bp, richInventory(bp));
    const issue = r.errors.find((e) => e.code === "format_invalid");
    expect(issue?.sectionIndex).toBe(1);
    expect(issue?.message).toBe("Section B: 16 questions can't add up to 40 marks. Short questions are worth 1 or 2 marks, so use 16 to 32 marks.");
  });

  it("reports too_many_topics when the paper has fewer questions than topics", () => {
    const format: PaperFormat = { durationMinutes: 30, sections: [{ label: "Section A", kind: "short", questionCount: 5, totalMarks: 10 }] };
    const bp = blueprint(11, 10, { format });
    const r = validateBlueprint(bp, richInventory(bp));
    expect(r.errors.find((e) => e.code === "too_many_topics")?.message).toBe(
      "This paper has room for only 5 questions, so it can't include all 11 topics. Choose fewer topics or a longer paper.",
    );
  });

  it("reports difficulty_invalid when the mix does not sum to 100", () => {
    const bp = blueprint(2, 30);
    const bad: Blueprint = { ...bp, difficulty: { basic: 50, standard: 50, challenging: 50 } };
    expect(codes(validateBlueprint(bad, richInventory(bad)).errors)).toContain("difficulty_invalid");
  });

  it("reports topic_has_no_questions by topic", () => {
    const bp = blueprint(3, 30);
    const inv = richInventory(bp);
    inv.topics = [{ topicId: "T1", questionCount: 9 }, { topicId: "T2", questionCount: 0 }];
    const missing = validateBlueprint(bp, inv).errors.filter((e) => e.code === "topic_has_no_questions");
    expect(missing.map((e) => e.topicId)).toEqual(["T2", "T3"]);
    expect(missing[0]?.message).toContain("We don't have questions for Angles that fit this paper yet.");
  });

  it("says which kind of question is short, with the marks, and a way forward", () => {
    const format: PaperFormat = {
      durationMinutes: 60,
      sections: [
        { label: "Section A", kind: "mcq", questionCount: 6, totalMarks: 12, marksEach: 2 },
        { label: "Section B", kind: "short", questionCount: 10, totalMarks: 15 },
      ],
    };
    const bp = blueprint(2, 40, { format });
    const inv = richInventory(bp);
    inv.sections[0] = supply([2, 2, 2, 2, 2]); // five 2-mark multiple-choice questions, six needed
    const r = validateBlueprint(bp, inv);
    expect(r.errors.map((e) => [e.code, e.sectionIndex, e.message])).toEqual([
      [
        "insufficient_inventory",
        0,
        "Section A: We don't have enough multiple-choice questions worth 2 marks for these topics. Try 1-mark questions or add a topic.",
      ],
    ]);
  });

  it("leaves the part name off when the paper has only one part", () => {
    const format: PaperFormat = { durationMinutes: 30, sections: [{ label: "Paper 1", kind: "word_problem", questionCount: 4, totalMarks: 12, marksEach: 3 }] };
    const bp = blueprint(1, 12, { format });
    const inv = richInventory(bp);
    inv.sections[0] = supply([3, 3]);
    expect(validateBlueprint(bp, inv).errors[0]?.message).toBe("We don't have enough word problems worth 3 marks for these topics. Try fewer questions or add a topic.");
  });

  it("uses the 'fewer questions' advice when the part has no fixed marks", () => {
    const format: PaperFormat = { durationMinutes: 30, sections: [{ label: "Section B", kind: "short", questionCount: 20, totalMarks: 30 }] };
    const bp = blueprint(1, 30, { format });
    const inv = richInventory(bp);
    inv.sections[0] = supply(ones(12));
    expect(validateBlueprint(bp, inv).errors[0]?.message).toBe("We don't have enough short-answer questions for these topics. Try fewer questions or add a topic.");
  });

  it("reports section_marks_unreachable when enough questions exist but not the exact count and marks", () => {
    // Ten short questions must make 15 marks; only 2-mark questions exist.
    const format: PaperFormat = { durationMinutes: 30, sections: [{ label: "Section B", kind: "short", questionCount: 10, totalMarks: 15 }] };
    const bp = blueprint(1, 15, { format });
    const inv = richInventory(bp);
    inv.sections[0] = supply(Array<number>(30).fill(2));
    const r = validateBlueprint(bp, inv);
    expect(codes(r.errors)).toEqual(["section_marks_unreachable"]);
    expect(r.errors[0]?.message).toBe(
      "We can't make exactly 15 marks from 10 short-answer questions for these topics. Try changing the marks or the number of questions, or add a topic.",
    );
  });

  it("checks parts of the same kind together", () => {
    const format: PaperFormat = {
      durationMinutes: 60,
      sections: [
        { label: "Paper 1", kind: "short", questionCount: 10, totalMarks: 10 },
        { label: "Paper 2", kind: "short", questionCount: 10, totalMarks: 10 },
      ],
    };
    const bp = blueprint(1, 20, { format });
    const inv = richInventory(bp);
    inv.sections = [supply(ones(12)), supply(ones(12))]; // both see the same 12 questions; 20 are needed
    const r = validateBlueprint(bp, inv);
    expect(r.errors.map((e) => [e.code, e.sectionIndex])).toEqual([["insufficient_inventory", 1]]);
  });

  it("warns duration_short and duration_long, without making them errors", () => {
    const shortBp = blueprint(4, 60, { durationMinutes: 45 });
    const short = validateBlueprint(shortBp, richInventory(shortBp));
    expect(codes(short.warnings)).toEqual(["duration_short"]);
    expect(short.warnings[0]?.message).toBe("45 minutes may be tight for 60 marks. Try 60 minutes or more.");
    expect(short.errors).toEqual([]);

    const longBp = blueprint(1, 10, { durationMinutes: 60 });
    const long = validateBlueprint(longBp, richInventory(longBp));
    expect(codes(long.warnings)).toEqual(["duration_long"]);
    expect(long.errors).toEqual([]);
  });

  it("does not warn on the boundaries (1 and 2 minutes per mark)", () => {
    for (const minutes of [30, 60]) {
      const bp = blueprint(2, 30, { durationMinutes: minutes });
      expect(validateBlueprint(bp, richInventory(bp)).warnings).toEqual([]);
    }
  });

  it("never mutates the blueprint or inventory", () => {
    const bp = blueprint(3, 40);
    const inv = richInventory(bp);
    const before = JSON.stringify([bp, inv]);
    validateBlueprint(bp, inv);
    const small = blueprint(1, 60);
    validateBlueprint(small, { sections: [supply([1]), supply([1])], topics: [{ topicId: "T1", questionCount: 1 }] });
    expect(JSON.stringify([bp, inv])).toBe(before);
  });

  it("is deterministic", () => {
    const bp = blueprint(2, 60);
    const inv: PaperInventory = { sections: [supply([1]), supply([1])], topics: [{ topicId: "T1", questionCount: 2 }, { topicId: "T2", questionCount: 2 }] };
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

describe("canFormCountAndSum", () => {
  it("needs both the count and the sum to be exact", () => {
    expect(canFormCountAndSum([1, 1, 2, 2], 3, 5)).toBe(true);
    expect(canFormCountAndSum([1, 1, 2, 2], 2, 5)).toBe(false);
    expect(canFormCountAndSum([1, 1, 2, 2], 4, 6)).toBe(true);
    expect(canFormCountAndSum([1, 1, 2, 2], 5, 6)).toBe(false);
    expect(canFormCountAndSum([3, 3, 3], 2, 6)).toBe(true);
    expect(canFormCountAndSum([3, 3, 3], 2, 7)).toBe(false);
    expect(canFormCountAndSum([], 0, 0)).toBe(true);
    expect(canFormCountAndSum([1], 0, 1)).toBe(false);
  });
});

describe("explainForParent", () => {
  const bannedWords = /blueprint|outcome|inventory|preset|percent|%/i;
  const leaks = (text: string): boolean => bannedWords.test(text);

  function everyIssue(): Issue[] {
    const all: Issue[] = [];
    const push = (bp: Blueprint, inv: PaperInventory) => {
      const r = validateBlueprint(bp, inv);
      all.push(...r.errors, ...r.warnings);
    };
    const rich = (bp: Blueprint) => richInventory(bp);
    let bp = blueprint(1, 65, { durationMinutes: 10 });
    push(bp, rich(bp));
    push(blueprint(0, 30), { sections: [], topics: [] });
    const tiny: PaperFormat = { durationMinutes: 30, sections: [{ label: "Section A", kind: "short", questionCount: 5, totalMarks: 10 }] };
    bp = blueprint(11, 10, { format: tiny });
    push(bp, rich(bp));
    bp = { ...blueprint(2, 30), difficulty: { basic: 1, standard: 1, challenging: 1 } };
    push(bp, rich(bp));
    bp = blueprint(2, 30);
    push(bp, { ...rich(bp), topics: [{ topicId: "T1", questionCount: 4 }] });
    bp = blueprint(1, 20, { durationMinutes: 25 });
    push(bp, { sections: [supply([1]), supply([1])], topics: [{ topicId: "T1", questionCount: 2 }] });
    const unreachable: PaperFormat = { durationMinutes: 30, sections: [{ label: "Section B", kind: "short", questionCount: 10, totalMarks: 15 }] };
    bp = blueprint(1, 15, { format: unreachable });
    push(bp, { sections: [supply(Array<number>(30).fill(2))], topics: [{ topicId: "T1", questionCount: 30 }] });
    const wrong: PaperFormat = { durationMinutes: 30, sections: [{ label: "Section B", kind: "short", questionCount: 16, totalMarks: 40 }] };
    bp = blueprint(1, 40, { format: wrong });
    push(bp, rich(bp));
    bp = blueprint(4, 60, { durationMinutes: 45 });
    push(bp, rich(bp));
    bp = blueprint(1, 10, { durationMinutes: 60 });
    push(bp, rich(bp));
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
        "format_invalid",
        "insufficient_inventory",
        "marks_out_of_range",
        "no_topics",
        "section_marks_unreachable",
        "too_many_topics",
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
      { code: "insufficient_inventory", message: "Blueprint inventory too small for outcome P3-NA-FR-01 (40%)." },
      { code: "duration_short", message: "This part needs 30 percent more time." },
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
    const b: Issue = { code: "marks_out_of_range", message: "Choose between 10 and 60 marks." };
    expect(explainForParent([a, b, a])).toEqual([a.message, b.message]);
    expect(explainForParent([])).toEqual([]);
  });

  it("detects banned wording in the detector itself", () => {
    for (const bad of ["The blueprint is ready", "3 outcomes", "inventory", "50%", "40 percent", "Use a preset"]) {
      expect(hasBannedParentWording(bad), bad).toBe(true);
    }
    for (const ok of ["Choose 20 marks.", "Try a different topic.", "Section B: use 16 to 32 marks.", "Ask a friend about Angles."]) {
      expect(hasBannedParentWording(ok), ok).toBe(false);
    }
  });

  it("the shortage wording covers each kind", () => {
    const section = (over: Partial<FormatSection>): FormatSection => ({ label: "Section A", kind: "mcq", questionCount: 4, totalMarks: 8, marksEach: 2, ...over });
    for (const s of [section({}), section({ marksEach: 1, totalMarks: 4 }), section({ kind: "short", marksEach: undefined, totalMarks: 6 }), section({ kind: "word_problem", marksEach: 3, totalMarks: 12 })]) {
      const format: PaperFormat = { durationMinutes: 30, sections: [s] };
      const bp = blueprint(1, s.totalMarks, { format });
      const inv = richInventory(bp);
      inv.sections[0] = supply([]);
      const message = validateBlueprint(bp, inv).errors.find((e) => e.code === "insufficient_inventory")?.message ?? "";
      expect(message).toMatch(/^We don't have enough (multiple-choice questions|short-answer questions|word problems)/);
      expect(message).toMatch(/Try .* or add a topic\.$/);
    }
  });
});
