import { describe, expect, it } from "vitest";
import {
  CHILD_ACTION_ORDER,
  PARENT_ACTION_ORDER,
  dailyPracticeComplete,
  isDueForPractice,
  nextChildAction,
  nextParentAction,
  weakestDueOutcome,
  weakestWeakOutcome,
  type ChildActionState,
  type ParentActionAssessment,
  type ParentActionAttempt,
  type ParentActionState,
  type PracticeOutcome,
} from "@/domain/recommendations";

const today = "2026-09-29";
const now = "2026-09-29T02:00:00.000Z";
const mia = { id: "child-mia", nickname: "Mia" };
const ben = { id: "child-ben", nickname: "Ben" };
const paper1 = { id: "p1", number: 1, status: "ready" as const };
const paper2 = { id: "p2", number: 2, status: "ready" as const };

function assessment(overrides: Partial<ParentActionAssessment> = {}): ParentActionAssessment {
  return { id: "a1", childId: mia.id, name: "Maths WA3", date: "2026-10-20", scopeConfirmed: true, papers: [paper1], ...overrides };
}

type AttemptOverrides = Partial<ParentActionAttempt> & Pick<ParentActionAttempt, "status">;
function attempt(overrides: AttemptOverrides): ParentActionAttempt {
  const base = { id: "t1", childId: mia.id, startedAt: "2026-09-28T02:00:00.000Z", paperId: "p1", label: "Maths WA3 · Mock 1" };
  if (overrides.status === "marked") {
    return { resultId: "r1", resultSeen: true, unreviewedMistakes: 0, ...base, ...overrides } as ParentActionAttempt;
  }
  return { ...base, ...overrides } as ParentActionAttempt;
}

function state(overrides: Partial<ParentActionState> = {}): ParentActionState {
  return { children: [mia], assessments: [assessment()], today, attempts: [], ...overrides };
}

const outcome = (overrides: Partial<PracticeOutcome> = {}): PracticeOutcome => ({
  outcomeId: "o1",
  name: "Length",
  state: "developing",
  ...overrides,
});

const allDone = { attempts: [attempt({ status: "marked" })] };

describe("nextParentAction: new attempt-driven states", () => {
  it("continue_mock: an unfinished attempt", () => {
    expect(nextParentAction(state({ attempts: [attempt({ status: "in_progress" })] }))).toEqual({
      kind: "continue_mock",
      title: "Mia's Maths WA3 · Mock 1 is in progress",
      supportingText: "Pick up where they left off.",
      ctaLabel: "Continue mock",
      href: "/mock/t1",
    });
  });

  it("marking_in_progress: submitted and waiting", () => {
    expect(nextParentAction(state({ attempts: [attempt({ status: "submitted" })] }))).toEqual({
      kind: "marking_in_progress",
      title: "We're marking Mia's Maths WA3 · Mock 1",
      supportingText: "The results will be here in a moment.",
      ctaLabel: "See marking progress",
      href: "/progress/results/t1",
    });
  });

  it("review_marking: the parent, not the child, checks uncertain answers", () => {
    expect(nextParentAction(state({ attempts: [attempt({ status: "needs_review", reviewCount: 2 })] }))).toEqual({
      kind: "review_marking",
      title: "We need a quick check on 2 answers",
      supportingText: "We weren't sure how to mark some of Mia's answers, and it takes about a minute to check.",
      ctaLabel: "Check answers",
      href: "/progress/review/t1",
    });
    expect(nextParentAction(state({ attempts: [attempt({ status: "needs_review", reviewCount: 1 })] })).title).toBe("We need a quick check on 1 answer");
    expect(nextParentAction(state({ attempts: [attempt({ status: "needs_review" })] })).title).toBe("We need a quick check on a few answers");
  });

  it("review_result: marked and not yet seen", () => {
    expect(nextParentAction(state({ attempts: [attempt({ status: "marked", resultSeen: false })] }))).toEqual({
      kind: "review_result",
      title: "Mia's Maths WA3 · Mock 1 is marked",
      supportingText: "See what went well and what needs work.",
      ctaLabel: "See what needs work",
      href: "/progress/results/r1",
    });
  });

  it("review_mistakes: result seen, mistakes not gone through", () => {
    expect(nextParentAction(state({ attempts: [attempt({ status: "marked", unreviewedMistakes: 3 })] }))).toEqual({
      kind: "review_mistakes",
      title: "Go through 3 mistakes from Maths WA3 · Mock 1",
      supportingText: "Fixing mistakes is the quickest way to improve.",
      ctaLabel: "Review mistakes",
      href: "/progress/results/r1#mistakes",
    });
    expect(nextParentAction(state({ attempts: [attempt({ status: "marked", unreviewedMistakes: 1 })] })).title).toBe(
      "Go through 1 mistake from Maths WA3 · Mock 1",
    );
  });

  it("falls back to a plain name when an attempt has no label", () => {
    const { label: _unused, ...unlabelled } = attempt({ status: "in_progress" }) as ParentActionAttempt & { label?: string };
    void _unused;
    expect(nextParentAction(state({ attempts: [unlabelled as ParentActionAttempt] })).title).toBe("Mia's mock is in progress");
  });
});

describe("nextParentAction: priority collisions", () => {
  const kinds = (attempts: ParentActionAttempt[], extra: Partial<ParentActionState> = {}) =>
    nextParentAction(state({ attempts, ...extra })).kind;

  it("attempts in flight beat every planning step", () => {
    const inProgress = attempt({ status: "in_progress" });
    expect(kinds([inProgress], { assessments: [] })).toBe("continue_mock");
    expect(kinds([inProgress], { assessments: [assessment({ scopeConfirmed: false })] })).toBe("continue_mock");
    expect(kinds([inProgress], { assessments: [assessment({ papers: [] })] })).toBe("continue_mock");
    expect(kinds([attempt({ status: "marked", resultSeen: false })], { assessments: [] })).toBe("review_result");
  });

  it("but never beat 'add a child'", () => {
    expect(kinds([attempt({ status: "in_progress" })], { children: [] })).toBe("add_child");
  });

  it("the documented order among attempt states", () => {
    const inProgress = attempt({ id: "a", status: "in_progress" });
    const needsReview = attempt({ id: "b", status: "needs_review" });
    const submitted = attempt({ id: "c", status: "submitted" });
    const unseen = attempt({ id: "d", status: "marked", resultId: "rd", resultSeen: false, unreviewedMistakes: 4 });
    const mistakes = attempt({ id: "e", status: "marked", resultId: "re", unreviewedMistakes: 2 });
    expect(kinds([mistakes, unseen, submitted, needsReview, inProgress])).toBe("continue_mock");
    expect(kinds([mistakes, unseen, submitted, needsReview])).toBe("review_marking");
    expect(kinds([mistakes, unseen, submitted])).toBe("marking_in_progress");
    expect(kinds([mistakes, unseen])).toBe("review_result");
    expect(kinds([mistakes])).toBe("review_mistakes");
  });

  it("the same state in two attempts: newest first, whatever the array order", () => {
    const older = attempt({ id: "old", status: "marked", resultId: "r-old", resultSeen: false, startedAt: "2026-09-20T00:00:00.000Z" });
    const newer = attempt({ id: "new", status: "marked", resultId: "r-new", resultSeen: false, startedAt: "2026-09-27T00:00:00.000Z" });
    expect(nextParentAction(state({ attempts: [older, newer] })).href).toBe("/progress/results/r-new");
    expect(nextParentAction(state({ attempts: [newer, older] })).href).toBe("/progress/results/r-new");
  });

  it("only the current child's attempts count", () => {
    const bens = attempt({ status: "in_progress", childId: ben.id });
    expect(kinds([bens])).toBe("start_mock");
    const two = state({ children: [mia, ben], attempts: [bens], assessments: [assessment({ childId: ben.id })], selectedChildId: ben.id });
    expect(nextParentAction(two).kind).toBe("continue_mock");
    expect(nextParentAction(two).title).toBe("Ben's Maths WA3 · Mock 1 is in progress");
  });

  it("seen results with no mistakes do not interrupt", () => {
    expect(kinds([attempt({ status: "marked", resultSeen: true, unreviewedMistakes: 0 })])).not.toMatch(/review|continue|marking/);
  });
});

describe("nextParentAction: after the mock is done", () => {
  const seen = { attempts: [attempt({ status: "marked" })] };

  it("an unattempted latest mock is still 'print mock'", () => {
    const later = assessment({ papers: [paper1, paper2] });
    expect(nextParentAction(state({ assessments: [later], attempts: [attempt({ status: "marked" })] })).kind).toBe("start_mock");
    expect(nextParentAction(state({ assessments: [later], attempts: [attempt({ status: "marked" })] })).href).toBe("/prepare/a1/mocks/p2");
  });

  it("without attempts loaded, behaviour is unchanged", () => {
    const { attempts: _omit, ...withoutAttempts } = state();
    void _omit;
    expect(nextParentAction(withoutAttempts).kind).toBe("start_mock");
    expect(nextParentAction({ ...withoutAttempts, practice: { outcomes: [outcome()], sessionsSinceLastMock: 9 } }).kind).toBe("start_mock");
  });

  it("final_mock: assessment within 3 days and final mock not done", () => {
    for (const [date, when] of [
      ["2026-09-29", "today"],
      ["2026-09-30", "tomorrow"],
      ["2026-10-02", "in 3 days"],
    ] as const) {
      expect(nextParentAction(state({ ...seen, assessments: [assessment({ date, finalMockDone: false })] }))).toEqual({
        kind: "final_mock",
        title: `Maths WA3 is ${when}`,
        supportingText: "One last full mock helps build confidence.",
        ctaLabel: "Do final mock",
        href: "/prepare/a1",
      });
    }
  });

  it("final_mock needs a known 'not done', and only inside the window", () => {
    const close = "2026-10-01";
    expect(nextParentAction(state({ ...seen, assessments: [assessment({ date: close })] })).kind).not.toBe("final_mock");
    expect(nextParentAction(state({ ...seen, assessments: [assessment({ date: close, finalMockDone: true })] })).kind).not.toBe("final_mock");
    expect(nextParentAction(state({ ...seen, assessments: [assessment({ date: "2026-10-03", finalMockDone: false })] })).kind).not.toBe("final_mock");
  });

  it("final_mock beats next-mock and practice when the exam is close", () => {
    const busy = state({
      ...seen,
      assessments: [assessment({ date: "2026-10-01", finalMockDone: false })],
      practice: { outcomes: [outcome()], sessionsSinceLastMock: 5 },
    });
    expect(nextParentAction(busy).kind).toBe("final_mock");
  });

  it("generate_next_mock: enough practice since the last mock", () => {
    expect(nextParentAction(state({ ...seen, practice: { sessionsSinceLastMock: 3 } }))).toEqual({
      kind: "generate_next_mock",
      title: "Time for the next Maths WA3 mock",
      supportingText: "Mia has practised since the last mock, so let's see how it went.",
      ctaLabel: "Generate next mock",
      href: "/prepare/a1",
    });
    expect(nextParentAction(state({ ...seen, practice: { sessionsSinceLastMock: 2, outcomes: [outcome()] } })).kind).toBe("start_practice");
  });

  it("generate_next_mock beats start_practice even while a weak area remains", () => {
    const result = nextParentAction(state({ ...seen, practice: { sessionsSinceLastMock: 4, outcomes: [outcome()] } }));
    expect(result.kind).toBe("generate_next_mock");
  });

  it("start_practice: names the weakest weak area", () => {
    const outcomes = [
      outcome({ outcomeId: "a", name: "Mass", state: "developing" }),
      outcome({ outcomeId: "b", name: "Length", state: "learning" }),
      outcome({ outcomeId: "c", name: "Fractions", state: "mastered" }),
    ];
    expect(nextParentAction(state({ ...seen, practice: { outcomes } }))).toEqual({
      kind: "start_practice",
      title: "Length needs attention",
      supportingText: "A 15-minute practice set will help.",
      ctaLabel: "Start 15-minute Length practice",
      href: "/progress/practice",
    });
  });

  it("done_today: nothing weak, or today's practice is done", () => {
    const strong = [outcome({ state: "mastered" }), outcome({ outcomeId: "o2", state: "not_started" })];
    expect(nextParentAction(state({ ...seen, practice: { outcomes: strong } }))).toEqual({
      kind: "done_today",
      title: "Mia is done for today",
      supportingText: "Nice work. Come back tomorrow for the next step.",
      ctaLabel: "See progress",
      href: "/progress",
    });
    expect(nextParentAction(state({ ...seen, practice: { outcomes: [outcome()], minutesToday: 15 } })).kind).toBe("done_today");
    expect(nextParentAction(state({ ...seen, practice: { outcomes: [outcome()], minutesToday: 14 } })).kind).toBe("start_practice");
    expect(nextParentAction(state({ ...seen })).kind).toBe("done_today");
  });

  it("finishing today's practice does not stop the next mock being offered", () => {
    expect(nextParentAction(state({ ...seen, practice: { sessionsSinceLastMock: 3, minutesToday: 30, outcomes: [outcome()] } })).kind).toBe("generate_next_mock");
  });

  it("earlier planning steps still come first", () => {
    expect(nextParentAction(state({ ...seen, assessments: [assessment({ scopeConfirmed: false, date: "2026-10-01", finalMockDone: false })] })).kind).toBe("confirm_scope");
    expect(nextParentAction(state({ ...seen, assessments: [assessment({ papers: [] })] })).kind).toBe("generate_mock");
  });
});

describe("nextParentAction: always exactly one valid action", () => {
  it("holds for every combination of the inputs", () => {
    const statuses: (ParentActionAttempt | undefined)[] = [
      undefined,
      attempt({ status: "in_progress" }),
      attempt({ status: "submitted" }),
      attempt({ status: "needs_review" }),
      attempt({ status: "marked", resultSeen: false }),
      attempt({ status: "marked", unreviewedMistakes: 2 }),
      attempt({ status: "marked" }),
    ];
    let count = 0;
    for (const children of [[], [mia]]) {
      for (const a of statuses) {
        for (const shape of ["none", "unconfirmed", "no_papers", "papers"] as const) {
          for (const date of ["2026-09-29", "2026-10-15"]) {
            for (const finalMockDone of [undefined, false, true]) {
              for (const practice of [undefined, { sessionsSinceLastMock: 3 }, { outcomes: [outcome()] }, { outcomes: [outcome()], minutesToday: 20 }]) {
                const assessments =
                  shape === "none"
                    ? []
                    : [
                        assessment({
                          date,
                          ...(finalMockDone === undefined ? {} : { finalMockDone }),
                          scopeConfirmed: shape !== "unconfirmed",
                          papers: shape === "no_papers" || shape === "unconfirmed" ? [] : [paper1],
                        }),
                      ];
                const action = nextParentAction({ children, assessments, today, ...(a ? { attempts: [a] } : {}), ...(practice ? { practice } : {}) });
                count += 1;
                expect(PARENT_ACTION_ORDER).toContain(action.kind);
                expect(action.title).not.toBe("");
                expect(action.ctaLabel).not.toBe("");
                expect(action.href).toMatch(/^\/[a-z]/);
                expect(action.supportingText ?? "").toMatch(/^[A-Z].*\.$/);
              }
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThan(500);
  });

  it("reaches every kind in the order list", () => {
    const seen = new Set<string>();
    const scenarios: ParentActionState[] = [
      state({ children: [] }),
      state({ attempts: [attempt({ status: "in_progress" })] }),
      state({ attempts: [attempt({ status: "needs_review" })] }),
      state({ attempts: [attempt({ status: "submitted" })] }),
      state({ attempts: [attempt({ status: "marked", resultSeen: false })] }),
      state({ attempts: [attempt({ status: "marked", unreviewedMistakes: 1 })] }),
      state({ assessments: [] }),
      state({ assessments: [assessment({ scopeConfirmed: false })] }),
      state({ assessments: [assessment({ papers: [] })] }),
      state(),
      state({ ...allDone, assessments: [assessment({ date: "2026-10-01", finalMockDone: false })] }),
      state({ ...allDone, practice: { sessionsSinceLastMock: 3 } }),
      state({ ...allDone, practice: { outcomes: [outcome()] } }),
      state({ ...allDone }),
    ];
    for (const s of scenarios) seen.add(nextParentAction(s).kind);
    expect([...seen].sort()).toEqual([...PARENT_ACTION_ORDER].sort());
  });

  it("uses parent-facing words only and does not change its input", () => {
    const input = state({ attempts: [attempt({ status: "needs_review", reviewCount: 2 })], practice: { outcomes: [outcome()] } });
    const copy = structuredClone(input);
    const words = /blueprint|outcome|confidence|multiplier|\bAI\b|mastery/i;
    for (const s of [input, state({ ...allDone, practice: { outcomes: [outcome()] } })]) {
      const action = nextParentAction(s);
      expect(`${action.title} ${action.supportingText} ${action.ctaLabel}`).not.toMatch(words);
    }
    expect(input).toEqual(copy);
  });
});

describe("practice focus", () => {
  it("orders weak areas: learning first, then lower accuracy, then least recently practised", () => {
    const list = [
      outcome({ outcomeId: "d1", state: "developing", recentAccuracy: 0.5 }),
      outcome({ outcomeId: "l1", state: "learning", recentAccuracy: 0.3 }),
      outcome({ outcomeId: "l2", state: "learning", recentAccuracy: 0.2 }),
    ];
    expect(weakestWeakOutcome(list)?.outcomeId).toBe("l2");
    expect(weakestWeakOutcome(list.slice(0, 2))?.outcomeId).toBe("l1");
    const tie = [
      outcome({ outcomeId: "x", recentAccuracy: 0.5, lastPracticedAt: "2026-09-20T00:00:00.000Z" }),
      outcome({ outcomeId: "y", recentAccuracy: 0.5, lastPracticedAt: "2026-09-10T00:00:00.000Z" }),
    ];
    expect(weakestWeakOutcome(tie)?.outcomeId).toBe("y");
    expect(weakestWeakOutcome([outcome({ outcomeId: "b" }), outcome({ outcomeId: "a" })])?.outcomeId).toBe("a");
    expect(weakestWeakOutcome([outcome({ state: "mastered" }), outcome({ state: "not_started" })])).toBeUndefined();
  });

  it("does not change the list it is given", () => {
    const list = [outcome({ outcomeId: "b" }), outcome({ outcomeId: "a" })];
    const copy = structuredClone(list);
    weakestWeakOutcome(list);
    weakestDueOutcome(list, now);
    expect(list).toEqual(copy);
  });

  it("mastered outcomes are due only when their spaced review date has passed", () => {
    expect(isDueForPractice(outcome({ state: "mastered" }), now)).toBe(false);
    expect(isDueForPractice(outcome({ state: "mastered", reviewDueAt: "2026-09-30T00:00:00.000Z" }), now)).toBe(false);
    expect(isDueForPractice(outcome({ state: "retained", reviewDueAt: "2026-09-29T02:00:00.000Z" }), now)).toBe(true);
    expect(isDueForPractice(outcome({ state: "not_started" }), now)).toBe(true);
  });

  it("weakest due: weak first, then not started, then nearly there, then reviews", () => {
    const list = [
      outcome({ outcomeId: "review", state: "mastered", reviewDueAt: "2026-09-01T00:00:00.000Z" }),
      outcome({ outcomeId: "almost", state: "almost_mastered" }),
      outcome({ outcomeId: "new", state: "not_started" }),
    ];
    expect(weakestDueOutcome(list, now)?.outcomeId).toBe("new");
    expect(weakestDueOutcome(list.filter((o) => o.outcomeId !== "new"), now)?.outcomeId).toBe("almost");
    expect(weakestDueOutcome(list.filter((o) => o.outcomeId === "review"), now)?.outcomeId).toBe("review");
    expect(weakestDueOutcome([outcome({ state: "retained" })], now)).toBeUndefined();
  });

  it("dailyPracticeComplete treats unknown as zero", () => {
    expect(dailyPracticeComplete(undefined)).toBe(false);
    expect(dailyPracticeComplete(14)).toBe(false);
    expect(dailyPracticeComplete(15)).toBe(true);
  });
});

describe("nextChildAction", () => {
  const base: ChildActionState = { now };
  const full: ChildActionState = {
    now,
    unfinishedMock: { attemptId: "m1" },
    unfinishedPractice: { sessionId: "s1", focusName: "Length" },
    dueMock: { attemptId: "m2", label: "Maths WA3 Mock 2" },
    newResult: { resultId: "r0", label: "Maths WA3 Mock 1" },
    mistakes: { count: 3, resultId: "r1" },
    practice: { outcomes: [outcome({ name: "Fractions" })], minutesToday: 0 },
  };

  it("resume_mock comes first", () => {
    expect(nextChildAction(full)).toEqual({
      kind: "resume_mock",
      title: "Let's finish your mock",
      supportingText: "You're partway through. Pick up where you stopped.",
      ctaLabel: "Continue",
      href: "/mock/m1",
    });
  });

  it("then resume_practice", () => {
    const { unfinishedMock: _m, ...rest } = full;
    void _m;
    expect(nextChildAction(rest)).toEqual({
      kind: "resume_practice",
      title: "Let's finish your Length practice",
      supportingText: "Pick up where you left off.",
      ctaLabel: "Continue",
      href: "/practice/s1",
    });
    expect(nextChildAction({ ...base, unfinishedPractice: { sessionId: "s9" } }).title).toBe("Let's finish your practice");
  });

  it("then a due mock becomes the mission", () => {
    const { unfinishedMock: _m, unfinishedPractice: _p, ...rest } = full;
    void _m;
    void _p;
    expect(nextChildAction(rest)).toEqual({
      kind: "start_mock",
      title: "Your Maths WA3 Mock 2 is ready",
      supportingText: "Take your time and do your best.",
      ctaLabel: "Start mock",
      href: "/mock/m2/start",
    });
    expect(nextChildAction({ ...base, dueMock: { attemptId: "m3" } }).title).toBe("Your mock is ready");
  });

  it("then a new result to look at, before the mistakes", () => {
    expect(nextChildAction({ ...base, newResult: { resultId: "r0", label: "Maths WA3 Mock 1" }, mistakes: { count: 3, resultId: "r0" } })).toEqual({
      kind: "see_results",
      title: "Your Maths WA3 Mock 1 is marked",
      supportingText: "Come and see how you did.",
      ctaLabel: "See my results",
      href: "/results/r0",
    });
    expect(nextChildAction({ ...base, newResult: { resultId: "r0" } }).title).toBe("Your mock is marked");
  });

  it("then mistakes to fix", () => {
    expect(nextChildAction({ ...base, mistakes: { count: 3, resultId: "r1" }, practice: full.practice as NonNullable<ChildActionState["practice"]> })).toEqual({
      kind: "fix_mistakes",
      title: "Let's fix 3 mistakes",
      supportingText: "Each one you fix helps you remember it next time.",
      ctaLabel: "Review mistakes",
      href: "/results/r1",
    });
    expect(nextChildAction({ ...base, mistakes: { count: 1, resultId: "r1" } }).title).toBe("Let's fix 1 mistake");
    expect(nextChildAction({ ...base, mistakes: { count: 0, resultId: "r1" } }).kind).toBe("done_today");
  });

  it("then practice for the weakest due outcome, about 15 minutes", () => {
    const practice = {
      outcomes: [outcome({ outcomeId: "a", name: "Mass", state: "developing" }), outcome({ outcomeId: "b", name: "Fractions", state: "learning" })],
    };
    expect(nextChildAction({ ...base, practice })).toEqual({
      kind: "start_practice",
      title: "Practise Fractions",
      supportingText: "About 15 minutes.",
      ctaLabel: "Start",
      href: "/practice",
    });
  });

  it("otherwise: You're done for today. Nice work.", () => {
    expect(nextChildAction(base)).toEqual({
      kind: "done_today",
      title: "You're done for today. Nice work.",
      supportingText: "Come back tomorrow for your next mission.",
      ctaLabel: "See my progress",
      href: "/progress",
    });
    expect(nextChildAction({ ...base, practice: { outcomes: [outcome({ state: "mastered" })] } }).kind).toBe("done_today");
    expect(nextChildAction({ ...base, practice: { outcomes: [outcome()], minutesToday: 15 } }).kind).toBe("done_today");
  });

  it("finished practice for today does not hide mistakes or a due mock", () => {
    const practice = { outcomes: [outcome()], minutesToday: 40 };
    expect(nextChildAction({ ...base, practice, mistakes: { count: 2, resultId: "r1" } }).kind).toBe("fix_mistakes");
    expect(nextChildAction({ ...base, practice, dueMock: { attemptId: "m" } }).kind).toBe("start_mock");
  });

  it("every priority collision resolves in the documented order", () => {
    const rules: [Partial<ChildActionState>, string][] = [
      [{ unfinishedMock: full.unfinishedMock! }, "resume_mock"],
      [{ unfinishedPractice: full.unfinishedPractice! }, "resume_practice"],
      [{ dueMock: full.dueMock! }, "start_mock"],
      [{ newResult: full.newResult! }, "see_results"],
      [{ mistakes: full.mistakes! }, "fix_mistakes"],
      [{ practice: full.practice! }, "start_practice"],
      [{}, "done_today"],
    ];
    expect(rules.map(([, kind]) => kind)).toEqual([...CHILD_ACTION_ORDER]);
    for (let i = 0; i < rules.length; i++) {
      // Every rule from i onwards is present: rule i must win.
      const combined = Object.assign({}, ...rules.slice(i).map(([part]) => part)) as Partial<ChildActionState>;
      expect(nextChildAction({ now, ...combined }).kind, `rule ${i}`).toBe(rules[i]![1]);
    }
  });

  it("child copy is short and warm: no mastery talk, no numbers about mastery, no rewards", () => {
    const words = /mastery|mastered|percent|%|accuracy|points|reward|badge|level|outcome|confidence/i;
    const scenarios: ChildActionState[] = [
      full,
      { ...full, unfinishedMock: undefined as never },
      base,
      { ...base, dueMock: { attemptId: "m", label: "Maths WA3 Mock 2" } },
      { ...base, mistakes: { count: 2, resultId: "r" } },
      { ...base, newResult: { resultId: "r", label: "Maths WA3 Mock 1" } },
      { ...base, practice: { outcomes: [outcome({ state: "learning", recentAccuracy: 0.2 })] } },
      { ...base, unfinishedPractice: { sessionId: "s" } },
    ];
    for (const s of scenarios) {
      const a = nextChildAction(s);
      const copy = `${a.title} ${a.supportingText} ${a.ctaLabel}`;
      expect(copy).not.toMatch(words);
      expect(a.title.length).toBeLessThanOrEqual(45);
      expect(a.supportingText).toMatch(/^[A-Z].*\.$/);
      expect(a.href).toMatch(/^\/[a-z]/);
    }
  });

  it("does not change its input and is deterministic", () => {
    const copy = structuredClone(full);
    expect(nextChildAction(full)).toEqual(nextChildAction(full));
    expect(full).toEqual(copy);
  });
});

describe("attempt-driven copy on Today and Home", () => {
  it("child: resume says where they were, without a menu", () => {
    expect(nextChildAction({ now, unfinishedMock: { attemptId: "t1", position: 8, total: 26 } })).toEqual({
      kind: "resume_mock",
      title: "Carry on with your mock",
      supportingText: "Question 8 of 26",
      ctaLabel: "Continue",
      href: "/mock/t1",
    });
  });

  it("child: a given mock is the mission itself, with its time, never points or rewards", () => {
    const action = nextChildAction({
      now,
      dueMock: { attemptId: "t2", label: "Mathematics End-of-year exam · Mock 1", durationText: "1 h 30 min" },
    });
    expect(action).toEqual({
      kind: "start_mock",
      title: "Mathematics End-of-year exam · Mock 1",
      supportingText: "1 h 30 min",
      ctaLabel: "Start",
      href: "/mock/t2/start",
    });
    expect(JSON.stringify(action).toLowerCase()).not.toMatch(/point|reward|badge/);
  });

  it("child: an unfinished mock still beats a waiting one, and nothing left means done for today", () => {
    expect(
      nextChildAction({ now, unfinishedMock: { attemptId: "a", position: 1, total: 5 }, dueMock: { attemptId: "b", durationText: "45 min" } }).kind,
    ).toBe("resume_mock");
    expect(nextChildAction({ now }).title).toBe("You're done for today. Nice work.");
  });

  it("parent: a mock waiting on the iPad is the next action, after work in progress and answers to check", () => {
    const waiting = attempt({ status: "assigned", id: "t9" });
    expect(nextParentAction(state({ attempts: [waiting] }))).toEqual({
      kind: "start_mock",
      title: "Maths WA3 · Mock 1 is waiting on Mia's Today screen",
      supportingText: "Hand the iPad over when they are ready to start.",
      ctaLabel: "Hand over the iPad",
      href: "/mock/t9",
    });
    expect(nextParentAction(state({ attempts: [waiting, attempt({ status: "in_progress", id: "t8" })] })).kind).toBe("continue_mock");
    expect(nextParentAction(state({ attempts: [waiting, attempt({ status: "needs_review", id: "t7" })] })).kind).toBe("review_marking");
  });

  it("parent: a mock that was given to the iPad no longer asks to be printed", () => {
    expect(nextParentAction(state({ attempts: [attempt({ status: "assigned" })] })).ctaLabel).not.toBe("Print mock");
  });
});

