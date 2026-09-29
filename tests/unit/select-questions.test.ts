import { describe, expect, it } from "vitest";
import {
  buildBlueprint,
  validateBlueprint,
  type Blueprint,
  type DifficultyLevel,
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
): Blueprint {
  return buildBlueprint({
    curriculumVersionId: "SG-MOE-PRI-MATH-2021-UPD-2025-10",
    level: "P3",
    subject: "Mathematics",
    topics: shortCodes.length === 0 ? BANK_TOPICS : topicsByShortCode(shortCodes),
    settings: { totalMarks, durationMinutes: totalMarks + 5, difficulty },
  });
}

/** Assert every hard constraint from the paper rules; returns the selected ids. */
function expectHardConstraints(bp: Blueprint, candidates: readonly Candidate[], result: SelectionResult): string[] {
  expect(result.ok).toBe(true);
  if (!result.ok) return [];
  const byId = new Map(candidates.map((c) => [c.questionId, c]));
  const ids = result.selection.map((q) => q.questionId);
  expect(new Set(ids).size, "no duplicate question").toBe(ids.length);

  const families = ids.map((id) => byId.get(id)?.familyId);
  expect(new Set(families).size, "no repeated family").toBe(families.length);

  const cellMarks = new Map<string, number>();
  for (const q of result.selection) {
    const c = byId.get(q.questionId);
    expect(c, q.questionId).toBeDefined();
    if (!c) continue;
    const scope = bp.scope.find((s) => s.topicId === c.topicId);
    expect(scope, "topic in scope").toBeDefined();
    expect(scope?.outcomeIds, "outcome in confirmed scope").toContain(c.primaryOutcomeId);
    expect(q.sectionCode).toBe(c.questionType === "mcq" ? "A" : "B");
    expect(q.topicId).toBe(c.topicId);
    expect(q.marks).toBe(c.marks);
    expect(q.difficulty).toBe(c.difficulty);
    const key = `${c.topicId}|${q.sectionCode}`;
    cellMarks.set(key, (cellMarks.get(key) ?? 0) + q.marks);
  }
  for (const s of bp.scope) {
    for (const code of ["A", "B"] as const) {
      expect(cellMarks.get(`${s.topicId}|${code}`) ?? 0, `${s.topicId} ${code}`).toBe(s.sectionMarks[code]);
    }
  }
  expect(result.report.totalMarks).toBe(bp.totalMarks);
  expect(result.report.marksBySection.A).toBe(bp.sections[0]?.marks);
  expect(result.report.marksBySection.B).toBe(bp.sections[1]?.marks);
  for (const s of bp.scope) expect(result.report.marksByTopic[s.topicId]).toBe(s.targetMarks);

  // Numbering: 1..N contiguous, section A before B, topics in blueprint order within a section.
  expect(result.selection.map((q) => q.number)).toEqual(result.selection.map((_, i) => i + 1));
  const firstB = result.selection.findIndex((q) => q.sectionCode === "B");
  if (firstB >= 0) expect(result.selection.slice(0, firstB).every((q) => q.sectionCode === "A")).toBe(true);
  if (firstB >= 0) expect(result.selection.slice(firstB).every((q) => q.sectionCode === "B")).toBe(true);
  const rank = { basic: 0, standard: 1, challenging: 2 } as const;
  for (const section of ["A", "B"] as const) {
    const inSection = result.selection.filter((q) => q.sectionCode === section);
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
  it("has 268 candidates over eleven topics", () => {
    expect(BANK_CANDIDATES).toHaveLength(268);
    expect(BANK_TOPICS).toHaveLength(11);
    expect(new Set(BANK_CANDIDATES.map((c) => c.topicId)).size).toBe(11);
  });
});

describe("selectQuestions on the real bank", () => {
  for (const scope of SCOPES) {
    describe(scope.name, () => {
      const bp = bankBlueprint(scope.codes, scope.marks);

      it("is valid and selects an exact, well-formed paper quickly", () => {
        const inv = summariseInventory(bp.scope, bp.sections, BANK_CANDIDATES);
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
      // Only "MN, AR, BG" is tight: reading bar graphs has just 8 written-answer questions
      // and a 10-mark cell needs 4 of them, so a repeat is unavoidable. All other scopes need none.
      expect(overlap, scope.name).toBeLessThanOrEqual(scope.codes.includes("BG") && scope.codes.length === 3 ? 2 : 0);
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
    expect(value.failure.topicId).toBe("P3-NA-FR");
    expect(["A", "B"]).toContain(value.failure.sectionCode);
    expect(value.failure.detail.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
    // Validation reports the same problem in parent language.
    const inv = summariseInventory(bp.scope, bp.sections, BANK_CANDIDATES);
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
          const inv = summariseInventory(bp.scope, bp.sections, BANK_CANDIDATES);
          if (validateBlueprint(bp, inv).errors.length > 0) continue;
          const r = selectQuestions({ blueprint: bp, candidates: BANK_CANDIDATES, seed: `${codes.join("")}-${marks}-${difficulty}` });
          if (r.ok) expectHardConstraints(bp, BANK_CANDIDATES, r);
          else expect(["insufficient_inventory", "no_exact_combination"]).toContain(r.failure.code);
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
  const bpFor = (topicIds: string[], totalMarks: number): Blueprint =>
    buildBlueprint({
      curriculumVersionId: "cv",
      level: "P3",
      subject: "Mathematics",
      topics: topicIds.map((t) => ({ topicId: t, label: t, outcomeIds: [`${t}-01`] })),
      settings: { totalMarks, durationMinutes: 30, difficulty: "balanced" },
    });
  // buildBlueprint always sends 25% to multiple choice, so use a hand-made blueprint for tiny cases.
  const tiny = (scope: { topicId: string; A: number; B: number }[]): Blueprint => {
    const bp = bpFor(scope.map((s) => s.topicId), 10);
    const total = scope.reduce((a, s) => a + s.A + s.B, 0);
    const sumOf = (k: "A" | "B") => scope.reduce((a, s) => a + s[k], 0);
    return {
      ...bp,
      totalMarks: total,
      sections: bp.sections.map((sec) => ({ ...sec, marks: sumOf(sec.code) })),
      scope: bp.scope.map((s, i) => ({
        ...s,
        targetMarks: (scope[i]?.A ?? 0) + (scope[i]?.B ?? 0),
        sectionMarks: { A: scope[i]?.A ?? 0, B: scope[i]?.B ?? 0 },
      })),
    };
  };

  it("resolves family clashes across topics by choosing different questions", () => {
    const bp = tiny([
      { topicId: "T1", A: 0, B: 2 },
      { topicId: "T2", A: 0, B: 2 },
    ]);
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
    const bp = tiny([
      { topicId: "T1", A: 0, B: 1 },
      { topicId: "T2", A: 0, B: 1 },
    ]);
    const candidates = [cand("a", "X", "T1", 1), cand("b", "X", "T2", 1)];
    const r = selectQuestions({ blueprint: bp, candidates, seed: "s" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe("no_exact_combination");
  });

  it("reports no_exact_combination for a cell whose marks cannot be formed", () => {
    const bp = tiny([{ topicId: "T1", A: 0, B: 3 }]);
    const r = selectQuestions({ blueprint: bp, candidates: [cand("a", "X", "T1", 2), cand("b", "Y", "T1", 2)], seed: "s" });
    expect(r).toMatchObject({ ok: false, failure: { code: "no_exact_combination", topicId: "T1", sectionCode: "B" } });
  });

  it("reports insufficient_inventory when a section has no eligible questions", () => {
    const bp = tiny([{ topicId: "T1", A: 1, B: 1 }]);
    const r = selectQuestions({ blueprint: bp, candidates: [cand("a", "X", "T1", 1)], seed: "s" });
    expect(r).toMatchObject({ ok: false, failure: { code: "insufficient_inventory", topicId: "T1", sectionCode: "A" } });
  });

  it("ignores questions outside the confirmed outcomes, other topics and mismatched types", () => {
    const bp = tiny([{ topicId: "T1", A: 1, B: 1 }]);
    const candidates = [
      cand("mc", "F1", "T1", 1, "mcq"),
      cand("wr", "F2", "T1", 1, "fraction"),
      { ...cand("off", "F3", "T1", 1, "mcq"), primaryOutcomeId: "T1-99" },
      cand("other", "F4", "T2", 1, "mcq"),
    ];
    const r = selectQuestions({ blueprint: bp, candidates, seed: "s" });
    expect(expectHardConstraints(bp, candidates, r).sort()).toEqual(["mc", "wr"]);
  });

  it("treats duplicate candidate ids as one question", () => {
    const bp = tiny([{ topicId: "T1", A: 0, B: 2 }]);
    const c = cand("a", "X", "T1", 1);
    const r = selectQuestions({ blueprint: bp, candidates: [c, c, c], seed: "s" });
    expect(r.ok).toBe(false);
  });

  it("rejects an internally inconsistent blueprint with a structured failure", () => {
    const bp = { ...tiny([{ topicId: "T1", A: 0, B: 2 }]), totalMarks: 7 };
    expect(selectQuestions({ blueprint: bp, candidates: [], seed: "s" })).toMatchObject({
      ok: false,
      failure: { code: "invalid_blueprint" },
    });
    const empty = { ...bpFor([], 10), scope: [] };
    expect(selectQuestions({ blueprint: empty, candidates: [], seed: "s" }).ok).toBe(false);
  });

  it("does not mutate its inputs", () => {
    const bp = tiny([{ topicId: "T1", A: 0, B: 2 }]);
    const candidates = [cand("a", "X", "T1", 1), cand("b", "Y", "T1", 1), cand("c", "Z", "T1", 1)];
    const avoid = ["a"];
    const before = JSON.stringify([bp, candidates, avoid]);
    selectQuestions({ blueprint: bp, candidates, seed: "s", avoidQuestionIds: avoid });
    expect(JSON.stringify([bp, candidates, avoid])).toBe(before);
  });
});
