import { describe, expect, it } from "vitest";
import {
  END_OF_YEAR_COMMON_FORMAT,
  WEIGHTED_COMMON_FORMAT,
  blueprintSections,
  buildBlueprint,
  formatQuestionCount,
  formatTotalMarks,
  questionKindOf,
  validateBlueprint,
  type Blueprint,
  type DifficultyLevel,
  type PaperFormat,
} from "@/domain/assessments";
import {
  selectQuestions,
  summariseInventory,
  type Candidate,
  type SelectionResult,
} from "@/domain/papers";
import { BANK_CANDIDATES, BANK_TOPICS, topicsByShortCode } from "../helpers/question-bank";

function bankBlueprint(
  shortCodes: string[],
  totalMarks: number,
  difficulty: DifficultyLevel = "balanced",
  format?: PaperFormat,
): Blueprint {
  return buildBlueprint({
    curriculumVersionId: "SG-MOE-PRI-MATH-2021-UPD-2025-10",
    level: "P3",
    subject: "Mathematics",
    topics: shortCodes.length === 0 ? BANK_TOPICS : topicsByShortCode(shortCodes),
    settings: { totalMarks, durationMinutes: totalMarks + 5, difficulty },
    format,
  });
}

/** Assert every hard constraint from the paper rules; returns the selected ids. */
function expectHardConstraints(bp: Blueprint, candidates: readonly Candidate[], result: SelectionResult): string[] {
  expect(result.ok).toBe(true);
  if (!result.ok) return [];
  const byId = new Map(candidates.map((c) => [c.questionId, c]));
  const sections = blueprintSections(bp);
  const ids = result.selection.map((q) => q.questionId);
  expect(new Set(ids).size, "no duplicate question").toBe(ids.length);

  const families = ids.map((id) => byId.get(id)?.familyId);
  expect(new Set(families).size, "no repeated family").toBe(families.length);

  const marksBySection = new Map<string, number[]>();
  for (const q of result.selection) {
    const c = byId.get(q.questionId);
    expect(c, q.questionId).toBeDefined();
    if (!c) continue;
    const scope = bp.scope.find((s) => s.topicId === c.topicId);
    expect(scope, "topic in scope").toBeDefined();
    expect(scope?.outcomeIds, "outcome in confirmed scope").toContain(c.primaryOutcomeId);
    const section = sections.find((s) => s.code === q.sectionCode);
    expect(section, "known part").toBeDefined();
    expect(questionKindOf(c), "question kind matches the part").toBe(section?.kind);
    if (section?.marksEach !== undefined) expect(c.marks, "marks each").toBe(section.marksEach);
    expect(q.topicId).toBe(c.topicId);
    expect(q.marks).toBe(c.marks);
    expect(q.difficulty).toBe(c.difficulty);
    marksBySection.set(q.sectionCode, [...(marksBySection.get(q.sectionCode) ?? []), q.marks]);
  }
  for (const section of sections) {
    const marks = marksBySection.get(section.code) ?? [];
    expect(marks.length, `${section.label} question count`).toBe(section.questionCount);
    expect(marks.reduce((a, b) => a + b, 0), `${section.label} marks`).toBe(section.totalMarks);
  }
  // Every chosen topic appears at least once.
  const present = new Set(result.selection.map((q) => q.topicId));
  for (const s of bp.scope) expect(present.has(s.topicId), `topic ${s.topicId} on the paper`).toBe(true);

  expect(result.report.totalMarks).toBe(bp.totalMarks);
  expect(result.selection).toHaveLength(formatQuestionCount(bp.format));
  expect(result.report.sections.map((s) => [s.code, s.label, s.questionCount, s.marks])).toEqual(
    sections.map((s) => [s.code, s.label, s.questionCount, s.totalMarks]),
  );
  for (const section of sections) expect(result.report.marksBySection[section.code]).toBe(section.totalMarks);
  expect(Object.values(result.report.marksByTopic).reduce((a, b) => a + b, 0)).toBe(bp.totalMarks);

  // Numbering: 1..N contiguous, parts in format order, topics in blueprint order within a part.
  expect(result.selection.map((q) => q.number)).toEqual(result.selection.map((_, i) => i + 1));
  const partOrder = result.selection.map((q) => q.sectionIndex);
  expect(partOrder).toEqual([...partOrder].sort((a, b) => a - b));
  const rank = { basic: 0, standard: 1, challenging: 2 } as const;
  for (const section of sections) {
    const inSection = result.selection.filter((q) => q.sectionCode === section.code);
    const order = inSection.map((q) => [bp.scope.findIndex((s) => s.topicId === q.topicId), rank[q.difficulty], q.questionId] as const);
    const sorted = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1));
    expect(order).toEqual(sorted);
  }

  const d = result.report.difficultyActual;
  expect(d.basic + d.standard + d.challenging).toBeGreaterThan(99.7);
  expect(d.basic + d.standard + d.challenging).toBeLessThan(100.3);
  return ids;
}

const time = <T>(fn: () => T): { value: T; ms: number } => {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
};

const SCOPES: { name: string; codes: string[]; marks: number }[] = [
  { name: "WN, AS, MD, FR at 40", codes: ["WN", "AS", "MD", "FR"], marks: 40 },
  { name: "FR, LM, TM at 40", codes: ["FR", "LM", "TM"], marks: 40 },
  { name: "FR alone at 20", codes: ["FR"], marks: 20 },
  { name: "MN, AR, BG at 40", codes: ["MN", "AR", "BG"], marks: 40 },
  { name: "all eleven topics at 40", codes: [], marks: 40 },
];

describe("real question bank fixture", () => {
  it("has every bank question as a candidate over eleven topics", () => {
    expect(BANK_CANDIDATES.length).toBeGreaterThanOrEqual(400);
    expect(BANK_TOPICS).toHaveLength(11);
    expect(new Set(BANK_CANDIDATES.map((c) => c.topicId)).size).toBe(11);
  });
});

describe("selectQuestions on the real bank", () => {
  for (const scope of SCOPES) {
    describe(scope.name, () => {
      const bp = bankBlueprint(scope.codes, scope.marks);

      it("is valid and selects an exact, well-formed paper quickly", () => {
        const inv = summariseInventory(bp.scope, bp.format, BANK_CANDIDATES);
        expect(validateBlueprint(bp, inv).errors).toEqual([]);

        const { value, ms } = time(() => selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "seed-1" }));
        expectHardConstraints(bp, BANK_CANDIDATES, value);
        expect(ms).toBeLessThan(1000);
      });

      it("gives identical output for the same seed, whatever the candidate order", () => {
        const a = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "same" });
        const b = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "same" });
        const c = selectQuestions({ blueprint: bp, candidates: [...BANK_CANDIDATES].reverse(), seed: "same" });
        expect(b).toEqual(a);
        expect(c).toEqual(a);
      });

      it("keeps the difficulty mix reasonably close to the target", () => {
        const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "difficulty" });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const d = r.report.difficultyActual;
        const distance =
          Math.abs(d.basic - bp.difficulty.basic) +
          Math.abs(d.standard - bp.difficulty.standard) +
          Math.abs(d.challenging - bp.difficulty.challenging);
        expect(distance).toBeLessThanOrEqual(40);
      });
    });
  }

  it("gives at least 3 distinct question sets for 5 different seeds (4-topic scope)", () => {
    const bp = bankBlueprint(["WN", "AS", "MD", "FR"], 40);
    const sets = new Set<string>();
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed });
      const ids = expectHardConstraints(bp, BANK_CANDIDATES, r);
      sets.add([...ids].sort().join(","));
    }
    expect(sets.size).toBeGreaterThanOrEqual(3);
  });

  it("keeps the overlap with a previous paper small when avoidQuestionIds is given", () => {
    for (const scope of SCOPES) {
      const bp = bankBlueprint(scope.codes, scope.marks);
      const first = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "paper-1" });
      const firstIds = expectHardConstraints(bp, BANK_CANDIDATES, first);
      const second = selectQuestions({
        blueprint: bp,
        candidates: BANK_CANDIDATES,
        seed: "paper-2",
        avoidQuestionIds: firstIds,
      });
      const secondIds = expectHardConstraints(bp, BANK_CANDIDATES, second);
      const overlap = secondIds.filter((id) => firstIds.includes(id)).length;
      expect(second.ok && second.report.usedAvoided).toBe(overlap);
      // Two scopes are tight: reading bar graphs has just 6 short-answer questions, and one topic alone
      // has only 8 two-mark ones, so a few repeats are unavoidable. All other scopes need none.
      const tight = scope.codes.includes("BG") && scope.codes.length === 3 ? 6 : scope.codes.join() === "FR" ? 2 : 0;
      expect(overlap, scope.name).toBeLessThanOrEqual(tight);
    }
  });

  it("falls back to reusing avoided questions only when it must, and reports how many", () => {
    // Paper 1 uses almost all of one topic's questions, so paper 2 cannot avoid them all.
    const bp = bankBlueprint(["FR"], 30);
    const allIds = BANK_CANDIDATES.filter((c) => c.topicId === "P3-NA-FR").map((c) => c.questionId);
    const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "x", avoidQuestionIds: allIds });
    const ids = expectHardConstraints(bp, BANK_CANDIDATES, r);
    expect(r.ok && r.report.usedAvoided).toBe(ids.length);
  });

  it("uses different papers for different seeds when inventory allows (FR at 20)", () => {
    const bp = bankBlueprint(["FR"], 20);
    const sets = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: `fr-${i}` });
      sets.add(expectHardConstraints(bp, BANK_CANDIDATES, r).sort().join(","));
    }
    expect(sets.size).toBeGreaterThanOrEqual(3);
  });

  it("spreads a topic's questions across its outcomes", () => {
    const bp = bankBlueprint(["FR"], 20);
    const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "variety" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byId = new Map(BANK_CANDIDATES.map((c) => [c.questionId, c]));
    const outcomes = new Set(r.selection.map((q) => byId.get(q.questionId)?.primaryOutcomeId));
    expect(outcomes.size).toBeGreaterThanOrEqual(3);
  });

  it("returns a structured failure for 60 marks on one topic", () => {
    const bp = bankBlueprint(["FR"], 60);
    const { value, ms } = time(() => selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "big" }));
    expect(value.ok).toBe(false);
    if (value.ok) return;
    expect(value.failure.code).toBe("insufficient_inventory");
    expect(["A", "B"]).toContain(value.failure.sectionCode);
    expect(value.failure.detail.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
    // Validation reports the same problem in parent language.
    const inv = summariseInventory(bp.scope, bp.format, BANK_CANDIDATES);
    expect(validateBlueprint(bp, inv).errors.map((e) => e.code)).toContain("insufficient_inventory");
  });

  it("property: every ok result over 50 seeds satisfies all hard constraints", () => {
    const cases = [
      bankBlueprint(["WN", "AS", "MD", "FR"], 40),
      bankBlueprint(["FR", "LM", "TM"], 40),
      bankBlueprint([], 40),
      bankBlueprint(["FR"], 20),
    ];
    for (const bp of cases) {
      for (let i = 0; i < 50; i += 1) {
        const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: `prop-${i}` });
        expect(r.ok, `${bp.scope.length} topics seed ${i}`).toBe(true);
        expectHardConstraints(bp, BANK_CANDIDATES, r);
      }
    }
  });

  it("property: papers stay valid across marks, difficulty and scope combinations", () => {
    const scopes = [["WN", "AS"], ["MD", "FR", "MN"], ["LM", "TM", "AR", "AN"], ["PL", "BG"]];
    for (const codes of scopes) {
      for (const marks of [10, 20, 30, 40, 50]) {
        for (const difficulty of ["easier", "balanced", "harder"] as const) {
          const bp = bankBlueprint(codes, marks, difficulty);
          const inv = summariseInventory(bp.scope, bp.format, BANK_CANDIDATES);
          if (validateBlueprint(bp, inv).errors.length > 0) continue;
          const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: `${codes.join("")}-${marks}-${difficulty}` });
          if (r.ok) expectHardConstraints(bp, BANK_CANDIDATES, r);
          else expect(["insufficient_inventory", "no_exact_combination", "topic_not_covered"]).toContain(r.failure.code);
        }
      }
    }
  });

  it("performance: each selection stays well under a second", () => {
    for (const scope of SCOPES) {
      const bp = bankBlueprint(scope.codes, scope.marks);
      for (const seed of ["p1", "p2", "p3"]) {
        const { value, ms } = time(() => selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed }));
        expect(value.ok).toBe(true);
        expect(ms, `${scope.name} ${seed}`).toBeLessThan(1000);
      }
    }
  });
});

describe("selectQuestions on small synthetic banks", () => {
  const cand = (id: string, family: string, topicId: string, marks: number, type: Candidate["questionType"] = "number", difficulty: Candidate["difficulty"] = "standard"): Candidate => ({
    questionId: id,
    familyId: family,
    topicId,
    primaryOutcomeId: `${topicId}-01`,
    questionType: type,
    difficulty,
    marks,
  });
  const bpWith = (topicIds: string[], format: PaperFormat): Blueprint =>
    buildBlueprint({
      curriculumVersionId: "cv",
      level: "P3",
      subject: "Mathematics",
      topics: topicIds.map((t) => ({ topicId: t, label: t, outcomeIds: [`${t}-01`] })),
      settings: { totalMarks: 10, durationMinutes: 30, difficulty: "balanced" },
      format,
    });
  /** One multiple-choice part and one short-answer part, sized exactly as given. */
  const tiny = (topicIds: string[], a: [count: number, marks: number], b: [count: number, marks: number]): Blueprint => {
    const sections: PaperFormat["sections"] = [];
    if (a[0] > 0) sections.push({ label: "Section A", kind: "mcq", questionCount: a[0], totalMarks: a[1] });
    if (b[0] > 0) sections.push({ label: sections.length ? "Section B" : "Section A", kind: "short", questionCount: b[0], totalMarks: b[1] });
    return bpWith(topicIds, { durationMinutes: 30, sections });
  };

  it("resolves family clashes across topics by choosing different questions", () => {
    const bp = tiny(["T1", "T2"], [0, 0], [4, 4]);
    const candidates = [
      cand("a1", "X", "T1", 1),
      cand("a2", "Y", "T1", 1),
      cand("a3", "Z", "T1", 1),
      cand("b1", "X", "T2", 1),
      cand("b2", "Y", "T2", 1),
      cand("b3", "W", "T2", 1),
    ];
    for (let i = 0; i < 30; i += 1) {
      expectHardConstraints(bp, candidates, selectQuestions({ blueprint: bp, candidates, seed: `s${i}` }));
    }
  });

  it("reports no_exact_combination when families make the paper impossible", () => {
    const bp = tiny(["T1", "T2"], [0, 0], [2, 2]);
    const candidates = [cand("a", "X", "T1", 1), cand("b", "X", "T2", 1)];
    const r = selectQuestions({ blueprint: bp, candidates, seed: "s" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe("no_exact_combination");
  });

  it("reports no_exact_combination for a part whose count and marks cannot both be met", () => {
    // Two questions worth 3 marks: only 2-mark questions exist.
    const bp = tiny(["T1"], [0, 0], [2, 3]);
    const r = selectQuestions({ blueprint: bp, candidates: [cand("a", "X", "T1", 2), cand("b", "Y", "T1", 2)], seed: "s" });
    expect(r).toMatchObject({ ok: false, failure: { code: "no_exact_combination", sectionCode: "A" } });
  });

  it("reports insufficient_inventory when a part has too few eligible questions", () => {
    const bp = tiny(["T1"], [1, 1], [1, 1]);
    const r = selectQuestions({ blueprint: bp, candidates: [cand("a", "X", "T1", 1)], seed: "s" });
    expect(r).toMatchObject({ ok: false, failure: { code: "insufficient_inventory", sectionCode: "A" } });
  });

  it("names the topic when a chosen topic cannot appear on the paper", () => {
    // T2 only has multiple-choice questions and the format has no multiple-choice part.
    const bp = tiny(["T1", "T2"], [0, 0], [2, 2]);
    const candidates = [cand("a", "X", "T1", 1), cand("b", "Y", "T1", 1), cand("c", "Z", "T2", 1, "mcq")];
    expect(selectQuestions({ blueprint: bp, candidates, seed: "s" })).toMatchObject({
      ok: false,
      failure: { code: "topic_not_covered", topicId: "T2" },
    });
  });

  it("names the topic when the paper has fewer questions than topics", () => {
    const bp = tiny(["T1", "T2", "T3"], [0, 0], [2, 2]);
    const candidates = ["T1", "T2", "T3"].flatMap((t) => [cand(`${t}a`, `${t}a`, t, 1), cand(`${t}b`, `${t}b`, t, 1)]);
    expect(selectQuestions({ blueprint: bp, candidates, seed: "s" })).toMatchObject({
      ok: false,
      failure: { code: "topic_not_covered", topicId: "T3" },
    });
  });

  it("puts every topic on the paper even when one topic has most of the questions", () => {
    const bp = tiny(["T1", "T2", "T3"], [0, 0], [4, 4]);
    const candidates = [
      ...Array.from({ length: 30 }, (_, i) => cand(`a${i}`, `fa${i}`, "T1", 1)),
      cand("b1", "fb1", "T2", 1),
      cand("c1", "fc1", "T3", 1),
    ];
    for (let i = 0; i < 20; i += 1) {
      const ids = expectHardConstraints(bp, candidates, selectQuestions({ blueprint: bp, candidates, seed: `cover-${i}` }));
      expect(ids).toContain("b1");
      expect(ids).toContain("c1");
    }
  });

  it("ignores questions outside the confirmed outcomes, other topics and mismatched kinds", () => {
    const bp = tiny(["T1"], [1, 1], [1, 1]);
    const candidates = [
      cand("mc", "F1", "T1", 1, "mcq"),
      cand("wr", "F2", "T1", 1, "fraction"),
      { ...cand("off", "F3", "T1", 1, "mcq"), primaryOutcomeId: "T1-99" },
      cand("other", "F4", "T2", 1, "mcq"),
      cand("word", "F5", "T1", 3, "number"),
    ];
    const r = selectQuestions({ blueprint: bp, candidates, seed: "s" });
    expect(expectHardConstraints(bp, candidates, r).sort()).toEqual(["mc", "wr"]);
  });

  it("treats duplicate candidate ids as one question", () => {
    const bp = tiny(["T1"], [0, 0], [2, 2]);
    const c = cand("a", "X", "T1", 1);
    const r = selectQuestions({ blueprint: bp, candidates: [c, c, c], seed: "s" });
    expect(r.ok).toBe(false);
  });

  it("rejects an internally inconsistent blueprint with a structured failure", () => {
    const bp = { ...tiny(["T1"], [0, 0], [2, 2]), totalMarks: 7 };
    expect(selectQuestions({ blueprint: bp, candidates: [], seed: "s" })).toMatchObject({
      ok: false,
      failure: { code: "invalid_blueprint" },
    });
    const empty = { ...tiny(["T1"], [0, 0], [2, 2]), scope: [] };
    expect(selectQuestions({ blueprint: empty, candidates: [], seed: "s" }).ok).toBe(false);
    const broken = bpWith(["T1"], { durationMinutes: 30, sections: [{ label: "Section A", kind: "short", questionCount: 5, totalMarks: 20 }] });
    expect(selectQuestions({ blueprint: broken, candidates: [], seed: "s" })).toMatchObject({ ok: false, failure: { code: "invalid_blueprint" } });
  });

  it("does not mutate its inputs", () => {
    const bp = tiny(["T1"], [0, 0], [2, 2]);
    const candidates = [cand("a", "X", "T1", 1), cand("b", "Y", "T1", 1), cand("c", "Z", "T1", 1)];
    const avoid = ["a"];
    const before = JSON.stringify([bp, candidates, avoid]);
    selectQuestions({ blueprint: bp, candidates, seed: "s", avoidQuestionIds: avoid });
    expect(JSON.stringify([bp, candidates, avoid])).toBe(before);
  });

  it("fills parts of the same kind without reusing a question", () => {
    const format: PaperFormat = {
      durationMinutes: 30,
      sections: [
        { label: "Paper 1", kind: "short", questionCount: 3, totalMarks: 3 },
        { label: "Paper 2", kind: "short", questionCount: 3, totalMarks: 3 },
      ],
    };
    const bp = bpWith(["T1", "T2"], format);
    const candidates = Array.from({ length: 6 }, (_, i) => cand(`q${i}`, `f${i}`, i % 2 === 0 ? "T1" : "T2", 1));
    const ids = expectHardConstraints(bp, candidates, selectQuestions({ blueprint: bp, candidates, seed: "twin" }));
    expect(ids.sort()).toEqual(["q0", "q1", "q2", "q3", "q4", "q5"]);
  });

  it("honours marks-each: a part of 2-mark questions only takes 2-mark questions", () => {
    const format: PaperFormat = { durationMinutes: 30, sections: [{ label: "Section A", kind: "mcq", questionCount: 2, totalMarks: 4, marksEach: 2 }] };
    const bp = bpWith(["T1"], format);
    const candidates = [cand("a", "F1", "T1", 1, "mcq"), cand("b", "F2", "T1", 2, "mcq"), cand("c", "F3", "T1", 2, "mcq"), cand("d", "F4", "T1", 1, "mcq"), cand("e", "F5", "T1", 1, "mcq")];
    expect(expectHardConstraints(bp, candidates, selectQuestions({ blueprint: bp, candidates, seed: "s" })).sort()).toEqual(["b", "c"]);
    expect(selectQuestions({ blueprint: bp, candidates: candidates.filter((c) => c.marks === 1 || c.questionId === "b"), seed: "s" })).toMatchObject({
      ok: false,
      failure: { code: "insufficient_inventory", sectionCode: "A" },
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Paper formats (three sections, booklets, presets)
// ---------------------------------------------------------------------------------------------

/** Enough extra 2-mark multiple choice questions (synthetic) that any scope can fill Section A. */
function withTopUp(candidates: readonly Candidate[]): Candidate[] {
  const extra: Candidate[] = [];
  for (const topic of BANK_TOPICS) {
    for (let i = 0; i < 4; i += 1) {
      extra.push({
        questionId: `top-up-${topic.topicId}-${i}`,
        familyId: `top-up-${topic.topicId}-${i}`,
        topicId: topic.topicId,
        primaryOutcomeId: topic.outcomeIds[i % topic.outcomeIds.length] as string,
        questionType: "mcq",
        difficulty: "standard",
        marks: 2,
      });
    }
  }
  return [...candidates, ...extra];
}

const EOY_SCOPES: { name: string; codes: string[] }[] = [
  { name: "all 11 topics", codes: [] },
  { name: "WN, AS, MD, FR, MN", codes: ["WN", "AS", "MD", "FR", "MN"] },
];

describe("the common end-of-year format (three sections, 50 marks)", () => {
  for (const scope of EOY_SCOPES) {
    const bp = bankBlueprint(scope.codes, 40, "balanced", END_OF_YEAR_COMMON_FORMAT);

    it(`${scope.name}: on the real bank it is ok when the inventory allows, and a structured failure when not`, () => {
      const inventory = validateBlueprint(bp, summariseInventory(bp.scope, bp.format, BANK_CANDIDATES));
      const { value, ms } = time(() => selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "eoy-1" }));
      expect(ms).toBeLessThan(1000);
      if (inventory.errors.length === 0) {
        expectHardConstraints(bp, BANK_CANDIDATES, value);
      } else {
        expect(value.ok).toBe(false);
        if (!value.ok) expect(["insufficient_inventory", "no_exact_combination", "topic_not_covered"]).toContain(value.failure.code);
      }
    });

    it(`${scope.name}: with enough 2-mark multiple choice questions it always makes a valid paper`, () => {
      const candidates = withTopUp(BANK_CANDIDATES);
      const { value, ms } = time(() => selectQuestions({ blueprint: bp, candidates, seed: "eoy-topped-up" }));
      expectHardConstraints(bp, candidates, value);
      expect(ms).toBeLessThan(1000);
    });
  }

  it("property: every ok result over 50 seeds satisfies all hard constraints", () => {
    const candidates = withTopUp(BANK_CANDIDATES);
    for (const scope of EOY_SCOPES) {
      const bp = bankBlueprint(scope.codes, 40, "balanced", END_OF_YEAR_COMMON_FORMAT);
      for (let i = 0; i < 50; i += 1) {
        const r = selectQuestions({ blueprint: bp, candidates, seed: `eoy-prop-${i}` });
        expect(r.ok, `${scope.name} seed ${i}`).toBe(true);
        expectHardConstraints(bp, candidates, r);
      }
    }
  });

  it("property: the real bank gives valid papers over 50 seeds for the all-topics scope", () => {
    const bp = bankBlueprint([], 40, "balanced", END_OF_YEAR_COMMON_FORMAT);
    const inventory = validateBlueprint(bp, summariseInventory(bp.scope, bp.format, BANK_CANDIDATES));
    if (inventory.errors.length > 0) return; // the bank cannot fill this format yet; the top-up test above covers the rules
    for (let i = 0; i < 50; i += 1) {
      expectHardConstraints(bp, BANK_CANDIDATES, selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: `real-${i}` }));
    }
  });

  it("gives identical output for the same seed, whatever the candidate order", () => {
    const candidates = withTopUp(BANK_CANDIDATES);
    const bp = bankBlueprint(["WN", "AS", "MD", "FR", "MN"], 40, "balanced", END_OF_YEAR_COMMON_FORMAT);
    const a = selectQuestions({ blueprint: bp, candidates, seed: "same" });
    const b = selectQuestions({ blueprint: bp, candidates, seed: "same" });
    const c = selectQuestions({ blueprint: bp, candidates: [...candidates].reverse(), seed: "same" });
    expect(a.ok).toBe(true);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("numbers continuously across sections and reports each section", () => {
    const candidates = withTopUp(BANK_CANDIDATES);
    const bp = bankBlueprint([], 40, "balanced", END_OF_YEAR_COMMON_FORMAT);
    const r = selectQuestions({ blueprint: bp, candidates, seed: "numbers" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.selection.map((q) => q.number)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    expect(r.selection.slice(0, 6).every((q) => q.sectionCode === "A" && q.marks === 2)).toBe(true);
    expect(r.selection.slice(6, 22).every((q) => q.sectionCode === "B")).toBe(true);
    expect(r.selection.slice(22).every((q) => q.sectionCode === "C" && q.marks === 3)).toBe(true);
    expect(r.report.sections.map((s) => [s.label, s.questionCount, s.marks])).toEqual([
      ["Section A", 6, 12],
      ["Section B", 16, 26],
      ["Section C", 4, 12],
    ]);
    expect(r.report.marksBySection).toEqual({ A: 12, B: 26, C: 12 });
  });

  it("balances topic marks: no topic is left far behind or far ahead (all 11 topics)", () => {
    const candidates = withTopUp(BANK_CANDIDATES);
    const bp = bankBlueprint([], 40, "balanced", END_OF_YEAR_COMMON_FORMAT);
    for (let i = 0; i < 10; i += 1) {
      const r = selectQuestions({ blueprint: bp, candidates, seed: `balance-${i}` });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const marks = Object.values(r.report.marksByTopic);
      expect(Math.max(...marks)).toBeLessThanOrEqual(8);
      expect(Math.max(...marks) - Math.min(...marks)).toBeLessThanOrEqual(6);
    }
  });

  it("gives different papers for different seeds", () => {
    const candidates = withTopUp(BANK_CANDIDATES);
    const bp = bankBlueprint(["WN", "AS", "MD", "FR", "MN"], 40, "balanced", END_OF_YEAR_COMMON_FORMAT);
    const sets = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const r = selectQuestions({ blueprint: bp, candidates, seed: `diff-${i}` });
      sets.add(expectHardConstraints(bp, candidates, r).sort().join(","));
    }
    expect(sets.size).toBeGreaterThanOrEqual(4);
  });

  it("avoids questions from an earlier mock", () => {
    const candidates = withTopUp(BANK_CANDIDATES);
    const bp = bankBlueprint([], 40, "balanced", END_OF_YEAR_COMMON_FORMAT);
    const first = selectQuestions({ blueprint: bp, candidates, seed: "m1" });
    const firstIds = expectHardConstraints(bp, candidates, first);
    const second = selectQuestions({ blueprint: bp, candidates, seed: "m2", avoidQuestionIds: firstIds });
    const secondIds = expectHardConstraints(bp, candidates, second);
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
  });

  it("a shortage of 2-mark multiple choice questions is a structured failure naming the part", () => {
    const bp = bankBlueprint(["FR"], 40, "balanced", END_OF_YEAR_COMMON_FORMAT);
    // Keep only two 2-mark multiple choice questions so Section A (6 needed) cannot be filled.
    let kept = 0;
    const scarce = BANK_CANDIDATES.filter((c) =>
      c.questionType === "mcq" && c.marks === 2 ? kept++ < 2 : true,
    );
    const r = selectQuestions({ blueprint: bp, candidates: scarce, seed: "short" });
    expect(r).toMatchObject({ ok: false, failure: { code: "insufficient_inventory", sectionCode: "A" } });
    // Validation says the same thing in a parent's words.
    const errors = validateBlueprint(bp, summariseInventory(bp.scope, bp.format, scarce)).errors;
    expect(errors.some((e) => /multiple-choice questions worth 2 marks/.test(e.message))).toBe(true);
  });

  it("an impossible format is a structured failure, quickly", () => {
    const format: PaperFormat = {
      durationMinutes: 60,
      sections: [
        { label: "Section A", kind: "short", questionCount: 40, totalMarks: 60 },
        { label: "Section B", kind: "word_problem", questionCount: 12, totalMarks: 36, marksEach: 3 },
      ],
    };
    const bp = bankBlueprint(["FR", "AR"], 40, "balanced", format);
    const { value, ms } = time(() => selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: "impossible" }));
    expect(value.ok).toBe(false);
    if (!value.ok) {
      expect(value.failure.code).toBe("insufficient_inventory");
      expect(value.failure.sectionCode).toBeDefined();
      expect(value.failure.detail.length).toBeGreaterThan(0);
    }
    expect(ms).toBeLessThan(1000);
  });
});

describe("other formats", () => {
  it("the weighted format (5 x 2-mark multiple choice, 5 x 2-mark short answer)", () => {
    const candidates = withTopUp(BANK_CANDIDATES);
    const bp = bankBlueprint(["FR", "AR", "TM"], 20, "balanced", WEIGHTED_COMMON_FORMAT);
    for (let i = 0; i < 20; i += 1) {
      expectHardConstraints(bp, candidates, selectQuestions({ blueprint: bp, candidates, seed: `w-${i}` }));
    }
    expect(formatTotalMarks(bp.format)).toBe(20);
  });

  it("booklet parts are filled like any other parts", () => {
    const format: PaperFormat = {
      durationMinutes: 60,
      sections: [
        { label: "Section A", booklet: "Booklet A", kind: "mcq", questionCount: 10, totalMarks: 10, marksEach: 1 },
        { label: "Section B", booklet: "Booklet B", kind: "short", questionCount: 14, totalMarks: 20 },
        { label: "Section C", booklet: "Booklet B", kind: "word_problem", questionCount: 3, totalMarks: 9, marksEach: 3 },
      ],
    };
    const bp = bankBlueprint(["FR", "AR", "TM", "MN"], 40, "balanced", format);
    for (let i = 0; i < 10; i += 1) {
      expectHardConstraints(bp, BANK_CANDIDATES, selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: `bk-${i}` }));
    }
  });

  it("a standard mock still works for every allowed total on a broad scope", () => {
    for (let total = 10; total <= 60; total += 5) {
      const bp = bankBlueprint([], total);
      const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: `std-${total}` });
      if (total >= 15) expectHardConstraints(bp, BANK_CANDIDATES, r);
    }
  });
});
