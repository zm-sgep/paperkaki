import { describe, expect, it } from "vitest";
import {
  nextParentAction,
  type ParentActionAssessment,
  type ParentActionState,
} from "@/domain/recommendations/next-parent-action";

const today = "2026-09-29";
const mia = { id: "child-mia", nickname: "Mia" };
const ben = { id: "child-ben", nickname: "Ben" };

function assessment(overrides: Partial<ParentActionAssessment> = {}): ParentActionAssessment {
  return {
    id: "a1",
    childId: mia.id,
    name: "Maths WA3",
    date: "2026-10-20",
    scopeConfirmed: false,
    papers: [],
    ...overrides,
  };
}

function state(overrides: Partial<ParentActionState> = {}): ParentActionState {
  return { children: [mia], assessments: [], today, ...overrides };
}

describe("nextParentAction", () => {
  it("rule 1: no children -> add child", () => {
    expect(nextParentAction(state({ children: [] }))).toEqual({
      kind: "add_child",
      title: "Who are you preparing?",
      ctaLabel: "Add your child",
      href: "/prepare/new",
    });
  });

  it("rule 2: no assessment -> add assessment, named after the child", () => {
    expect(nextParentAction(state())).toEqual({
      kind: "add_assessment",
      title: "What is Mia preparing for?",
      ctaLabel: "Add upcoming assessment",
      href: "/prepare/new",
    });
  });

  it("rule 2: an assessment dated today still counts as upcoming", () => {
    expect(nextParentAction(state({ assessments: [assessment({ date: today })] })).kind).toBe("confirm_scope");
  });

  it("rule 2: past-dated assessments are ignored, even with papers", () => {
    const past = assessment({
      date: "2026-09-28",
      scopeConfirmed: true,
      papers: [{ id: "p1", number: 1, status: "ready" }],
    });
    expect(nextParentAction(state({ assessments: [past] })).kind).toBe("add_assessment");
  });

  it("rule 3: nearest upcoming assessment without confirmed scope -> choose topics", () => {
    expect(nextParentAction(state({ assessments: [assessment()] }))).toEqual({
      kind: "confirm_scope",
      title: "Maths WA3: choose the topics",
      ctaLabel: "Choose topics",
      href: "/prepare/a1/scope",
    });
  });

  it("rule 4: confirmed scope and no papers -> generate first mock", () => {
    expect(nextParentAction(state({ assessments: [assessment({ scopeConfirmed: true })] }))).toEqual({
      kind: "generate_mock",
      title: "Maths WA3: topics confirmed",
      ctaLabel: "Generate first mock",
      href: "/prepare/a1",
    });
  });

  it("rule 5: has papers -> print the highest-numbered mock", () => {
    const withPapers = assessment({
      scopeConfirmed: true,
      papers: [
        { id: "p2", number: 2, status: "ready" },
        { id: "p3", number: 3, status: "ready" },
        { id: "p1", number: 1, status: "ready" },
      ],
    });
    expect(nextParentAction(state({ assessments: [withPapers] }))).toEqual({
      kind: "start_mock",
      title: "Maths WA3 · Mock 3 is ready",
      ctaLabel: "Print mock",
      href: "/prepare/a1/mocks/p3",
    });
  });

  it("uses the earliest upcoming assessment, whatever order they are listed in", () => {
    const later = assessment({ id: "later", name: "Maths SA1", date: "2026-11-05", scopeConfirmed: true });
    const sooner = assessment({ id: "sooner", name: "Maths WA3", date: "2026-10-20" });
    const result = nextParentAction(state({ assessments: [later, sooner] }));
    expect(result.kind).toBe("confirm_scope");
    expect(result.href).toBe("/prepare/sooner/scope");
  });

  it("ties on date go to the earliest created (array order)", () => {
    const first = assessment({ id: "first", name: "Maths WA3", date: "2026-10-20" });
    const second = assessment({ id: "second", name: "Science WA3", date: "2026-10-20", scopeConfirmed: true });
    expect(nextParentAction(state({ assessments: [first, second] })).href).toBe("/prepare/first/scope");
    expect(nextParentAction(state({ assessments: [second, first] })).href).toBe("/prepare/second");
  });

  it("looks only at the selected child, defaulting to the first child", () => {
    const forBen = assessment({ id: "ben-1", childId: ben.id, name: "Maths WA3" });
    const twoChildren = state({ children: [mia, ben], assessments: [forBen] });
    expect(nextParentAction(twoChildren).kind).toBe("add_assessment");
    expect(nextParentAction(twoChildren).title).toBe("What is Mia preparing for?");
    const selected = nextParentAction({ ...twoChildren, selectedChildId: ben.id });
    expect(selected.kind).toBe("confirm_scope");
    expect(selected.href).toBe("/prepare/ben-1/scope");
  });

  it("falls back to the first child when the selected child is unknown", () => {
    expect(nextParentAction(state({ selectedChildId: "someone-else" })).title).toBe("What is Mia preparing for?");
  });

  it("always returns exactly one action with a label and a local link", () => {
    const paper = { id: "p1", number: 1, status: "ready" as const };
    const cases: ParentActionState[] = [
      state({ children: [] }),
      state(),
      state({ assessments: [assessment()] }),
      state({ assessments: [assessment({ scopeConfirmed: true })] }),
      state({ assessments: [assessment({ scopeConfirmed: true, papers: [paper] })] }),
      state({ assessments: [assessment({ date: "2020-01-01" })] }),
    ];
    const kinds = new Set<string>();
    for (const input of cases) {
      const action = nextParentAction(input);
      kinds.add(action.kind);
      expect(action.title).not.toBe("");
      expect(action.ctaLabel).not.toBe("");
      expect(action.href).toMatch(/^\/prepare/);
    }
    expect(kinds.size).toBe(5);
  });

  it("does not change its input", () => {
    const input = state({ assessments: [assessment({ id: "b", date: "2026-11-01" }), assessment({ id: "a" })] });
    const copy = structuredClone(input);
    nextParentAction(input);
    expect(input).toEqual(copy);
  });

  it("uses parent-facing words only", () => {
    const words = /blueprint|outcome|confidence|multiplier/i;
    const paper = { id: "p1", number: 1, status: "ready" as const };
    for (const input of [
      state({ children: [] }),
      state(),
      state({ assessments: [assessment()] }),
      state({ assessments: [assessment({ scopeConfirmed: true })] }),
      state({ assessments: [assessment({ scopeConfirmed: true, papers: [paper] })] }),
    ]) {
      const action = nextParentAction(input);
      expect(`${action.title} ${action.supportingText ?? ""} ${action.ctaLabel}`).not.toMatch(words);
    }
  });
});
