import { describe, expect, it } from "vitest";
import {
  MASTERY_POLICY_V1,
  MASTERY_STATE_RULES,
  deriveMastery,
  deriveOutcomeMastery,
  stateFromMetrics,
  summariseTopic,
  type MasteryEvidence,
  type MasteryMetrics,
} from "@/domain/mastery";

const O = "P3.FRAC.1";

/** 10:00 Singapore time on 2026-09-01, plus `day` days and `minute` minutes. */
function at(day: number, minute = 0): string {
  return new Date(Date.UTC(2026, 8, 1 + day, 2, minute)).toISOString();
}

let counter = 0;
function item(o: Partial<MasteryEvidence> & { day?: number; minute?: number } = {}): MasteryEvidence {
  const { day = 0, minute = 0, ...rest } = o;
  counter += 1;
  return {
    outcomeId: O,
    questionId: `q${counter}`,
    familyId: "fam-a",
    questionType: "number",
    difficulty: "standard",
    scoreRatio: 1,
    firstAttempt: true,
    sessionId: `s-day${day}`,
    at: at(day, minute),
    ...rest,
  };
}

/** `n` items in one session on one day, alternating between two families. */
function session(day: number, n: number, over: Partial<MasteryEvidence> = {}, sessionId = `s-day${day}`): MasteryEvidence[] {
  return Array.from({ length: n }, (_, i) =>
    item({ day, minute: i, sessionId, familyId: i % 2 === 0 ? "fam-a" : "fam-b", ...over }),
  );
}

const now = at(60);
const derive = (evidence: MasteryEvidence[], when: string = now) => deriveOutcomeMastery(O, evidence, when);

describe("MASTERY_POLICY_V1 and the rule table", () => {
  it("keeps the thresholds in one exported policy", () => {
    expect(MASTERY_POLICY_V1.bands).toEqual({ developing: 0.4, almostMastered: 0.65, mastered: 0.8 });
    expect(MASTERY_POLICY_V1.masteredNeeds).toMatchObject({ minItems: 5, minSessions: 2, minDays: 2, minFamilies: 2, minNonBasicItems: 1 });
    expect(MASTERY_POLICY_V1.recentWindow).toBe(10);
    expect(MASTERY_POLICY_V1.retention.reviewIntervalsDays).toEqual([7, 21]);
  });

  it("evaluates rules in a fixed named order", () => {
    expect(MASTERY_STATE_RULES.map((r) => r.id)).toEqual([
      "too_little_evidence",
      "low_accuracy",
      "medium_accuracy",
      "one_session_ceiling",
      "mastered",
      "almost_mastered",
    ]);
  });

  const strong: MasteryMetrics = { items: 8, sessions: 3, days: 3, families: 2, nonBasicItems: 4, accuracy: 0.9 };
  it("maps metrics to states at the documented boundaries", () => {
    expect(stateFromMetrics({ ...strong, items: 2 })).toBe("learning");
    expect(stateFromMetrics({ ...strong, accuracy: 0.399 })).toBe("learning");
    expect(stateFromMetrics({ ...strong, accuracy: 0.4 })).toBe("developing");
    expect(stateFromMetrics({ ...strong, accuracy: 0.649 })).toBe("developing");
    expect(stateFromMetrics({ ...strong, accuracy: 0.65 })).toBe("almost_mastered");
    expect(stateFromMetrics({ ...strong, accuracy: 0.799 })).toBe("almost_mastered");
    expect(stateFromMetrics({ ...strong, accuracy: 0.8 })).toBe("mastered");
    expect(stateFromMetrics({ ...strong, sessions: 1, days: 1 })).toBe("developing");
  });

  it("each mastered requirement is needed", () => {
    expect(stateFromMetrics({ ...strong, items: 4 })).toBe("almost_mastered");
    expect(stateFromMetrics({ ...strong, sessions: 1 })).toBe("developing");
    expect(stateFromMetrics({ ...strong, days: 1 })).toBe("almost_mastered");
    expect(stateFromMetrics({ ...strong, families: 1 })).toBe("almost_mastered");
    expect(stateFromMetrics({ ...strong, nonBasicItems: 0 })).toBe("almost_mastered");
  });
});

describe("deriveOutcomeMastery", () => {
  it("no evidence is not_started", () => {
    expect(derive([])).toEqual({ outcomeId: O, state: "not_started", evidenceCount: 0, sessions: 0 });
  });

  it("one question, even perfect, is only learning", () => {
    expect(derive([item()])).toMatchObject({ state: "learning", evidenceCount: 1, sessions: 1 });
    expect(derive(session(0, 2))).toMatchObject({ state: "learning" });
  });

  it("one perfect session never gives mastered, however long", () => {
    for (const n of [3, 5, 10, 30]) {
      const result = derive(session(0, n));
      expect(result.state, `n=${n}`).toBe("developing");
      expect(result.sessions).toBe(1);
      expect(result.masteredAt).toBeUndefined();
    }
  });

  it("two perfect sessions on the same day are not enough either", () => {
    const evidence = [...session(0, 5, {}, "morning"), ...session(0, 5, {}, "evening").map((e, i) => ({ ...e, at: at(0, 200 + i) }))];
    expect(derive(evidence)).toMatchObject({ state: "almost_mastered", sessions: 2 });
  });

  it("needs a second day and reaches mastered on that day", () => {
    const day0 = session(0, 5);
    const day3 = session(3, 3);
    const result = derive([...day0, ...day3]);
    expect(result.state).toBe("mastered");
    expect(result.evidenceCount).toBe(8);
    expect(result.sessions).toBe(2);
    // Mastery arrives with the first item of the second day, not before and not after.
    expect(result.masteredAt).toBe(day3[0]!.at);
    // Asked on day 1, before the second session happens, it is not mastered yet.
    expect(derive([...day0, ...day3], at(1)).state).toBe("developing");
  });

  it("needs two question families and one non-basic item", () => {
    const oneFamily = [...session(0, 5, { familyId: "fam-a" }), ...session(2, 3, { familyId: "fam-a" })];
    expect(derive(oneFamily).state).toBe("almost_mastered");
    const allBasic = [...session(0, 5, { difficulty: "basic" }), ...session(2, 3, { difficulty: "basic" })];
    expect(derive(allBasic).state).toBe("almost_mastered");
    const oneChallenge = [...session(0, 5, { difficulty: "basic" }), ...session(2, 3, { difficulty: "basic" })];
    oneChallenge[6] = { ...oneChallenge[6]!, difficulty: "challenging" };
    expect(derive(oneChallenge).state).toBe("mastered");
  });

  it("needs at least five first-attempt items", () => {
    expect(derive([...session(0, 2), ...session(1, 2)]).state).toBe("almost_mastered");
    expect(derive([...session(0, 3), ...session(1, 2)]).state).toBe("mastered");
  });

  it("retries do not count as evidence but do count as practice", () => {
    const retries = [...session(0, 5), ...session(3, 3, { firstAttempt: false })];
    const result = derive(retries);
    expect(result).toMatchObject({ state: "developing", evidenceCount: 5, sessions: 1 });
    expect(result.lastPracticedAt).toBe(retries[retries.length - 1]!.at);
    expect(derive(session(0, 8, { firstAttempt: false }))).toMatchObject({ state: "learning", evidenceCount: 0, sessions: 0 });
  });

  it("splits Singapore days at midnight Singapore time, not UTC", () => {
    // 23:30Z and 00:30Z are 07:30 and 08:30 in Singapore: the same day.
    const sameSgDay = [
      ...session(0, 5).map((e) => ({ ...e, at: "2026-09-01T23:30:00.000Z" })),
      ...session(1, 3, {}, "later").map((e) => ({ ...e, at: "2026-09-02T00:30:00.000Z" })),
    ];
    expect(derive(sameSgDay).state).toBe("almost_mastered");
    // 15:30Z and 16:30Z straddle Singapore midnight: two days.
    const twoSgDays = [
      ...session(0, 5).map((e) => ({ ...e, at: "2026-09-01T15:30:00.000Z" })),
      ...session(1, 3, {}, "later").map((e) => ({ ...e, at: "2026-09-01T16:30:00.000Z" })),
    ];
    expect(derive(twoSgDays).state).toBe("mastered");
  });

  it("uses graded bands for the middle states", () => {
    // Two sessions on two days; alternate right/wrong for about 50% -> developing.
    const half = [...session(0, 6), ...session(1, 6)].map((e, i) => ({ ...e, scoreRatio: i % 2 === 0 ? 1 : 0 }));
    expect(derive(half).state).toBe("developing");
    // Mostly wrong -> learning.
    const poor = [...session(0, 6), ...session(1, 6)].map((e, i) => ({ ...e, scoreRatio: i % 5 === 0 ? 1 : 0 }));
    expect(derive(poor).state).toBe("learning");
    // Mostly right, some wrong -> almost mastered.
    const nearly = [...session(0, 6), ...session(1, 6)].map((e, i) => ({ ...e, scoreRatio: i === 6 || i === 8 || i === 10 ? 0 : 1 }));
    const nearlyState = derive(nearly);
    expect(nearlyState.recentAccuracy).toBeGreaterThanOrEqual(0.65);
    expect(nearlyState.recentAccuracy).toBeLessThan(0.8);
    expect(nearlyState.state).toBe("almost_mastered");
  });

  it("weights harder items more", () => {
    const base = [...session(0, 5), ...session(1, 5)];
    const missEasy = base.map((e, i) => ({ ...e, difficulty: i === 6 ? ("basic" as const) : ("challenging" as const), scoreRatio: i === 6 ? 0 : 1 }));
    const missHard = base.map((e, i) => ({ ...e, difficulty: i === 6 ? ("challenging" as const) : ("basic" as const), scoreRatio: i === 6 ? 0 : 1 }));
    expect(derive(missEasy).recentAccuracy!).toBeGreaterThan(derive(missHard).recentAccuracy!);
  });

  it("can drop after failures, using only the recent window", () => {
    const good = [...session(0, 5), ...session(2, 5)];
    expect(derive(good).state).toBe("mastered");
    const failures = session(4, 5, { scoreRatio: 0 });
    const dropped = derive([...good, ...failures]);
    expect(["learning", "developing", "almost_mastered"]).toContain(dropped.state);
    expect(dropped.state).not.toBe("mastered");
    expect(dropped.masteredAt).toBeUndefined();
    expect(dropped.reviewDueAt).toBeUndefined();
    // Every item of the last window counts: 10 recent items, only the newest 10 decide.
    expect(dropped.evidenceCount).toBe(15);
  });

  it("recent evidence outweighs old evidence", () => {
    const oldBad = session(0, 10, { scoreRatio: 0 });
    const newGood = [...session(2, 5), ...session(3, 5)];
    // The bad items fall outside the window of the newest 10.
    expect(derive([...oldBad, ...newGood]).state).toBe("mastered");
  });

  it("can regain mastery, restarting the clock", () => {
    const evidence = [...session(0, 5), ...session(2, 5), ...session(4, 6, { scoreRatio: 0 }), ...session(6, 5), ...session(7, 5)];
    const result = derive(evidence);
    expect(result.state).toBe("mastered");
    expect(new Date(result.masteredAt!).getTime()).toBeGreaterThan(Date.parse(at(4)));
  });

  describe("retention", () => {
    const base = [...session(0, 5), ...session(1, 3)];
    const masteredAt = at(1); // first item of day 1

    it("mastered, not yet retained: first review due 7 days after mastery", () => {
      const result = derive(base);
      expect(result.state).toBe("mastered");
      expect(result.masteredAt).toBe(masteredAt);
      expect(result.reviewDueAt).toBe(at(8));
    });

    it("correct practice inside the first 7 days does not make it retained", () => {
      const early = [...base, item({ day: 6, familyId: "fam-b" })];
      expect(derive(early)).toMatchObject({ state: "mastered", reviewDueAt: at(8) });
    });

    it("a correct first attempt at least 7 days later makes it retained", () => {
      const result = derive([...base, item({ day: 8, familyId: "fam-b" })]);
      expect(result.state).toBe("retained");
      // Next review is 21 days after that check.
      expect(result.reviewDueAt).toBe(at(29));
    });

    it("exactly on the seventh day counts; one minute short does not", () => {
      expect(derive([...base, item({ day: 8, minute: 0 })]).state).toBe("retained");
      expect(derive([...base, item({ day: 8, minute: -1 })]).state).toBe("mastered");
    });

    it("the retention item must be fully correct and a first attempt", () => {
      expect(derive([...base, item({ day: 9, scoreRatio: 0.5 })]).state).toBe("mastered");
      expect(derive([...base, item({ day: 9, firstAttempt: false })]).state).toBe("mastered");
    });

    it("a second spaced check only counts after 21 days", () => {
      const first = item({ day: 8 });
      expect(derive([...base, first, item({ day: 20 })]).reviewDueAt).toBe(at(29));
      expect(derive([...base, first, item({ day: 29 })]).reviewDueAt).toBe(at(50));
    });

    it("loses retained when recent work goes badly", () => {
      const result = derive([...base, item({ day: 8 }), ...session(10, 6, { scoreRatio: 0 })]);
      expect(result.state).not.toBe("retained");
      expect(result.state).not.toBe("mastered");
    });

    it("does not look into the future", () => {
      expect(derive([...base, item({ day: 8 })], at(5)).state).toBe("mastered");
      expect(derive([...base, item({ day: 8 })], at(5)).evidenceCount).toBe(8);
    });
  });

  it("rejects an invalid timestamp instead of guessing", () => {
    expect(() => derive([item({ at: "not a date" })])).toThrow(RangeError);
    expect(() => derive([item({ scoreRatio: Number.NaN })])).toThrow(RangeError);
    expect(() => deriveOutcomeMastery(O, [], "nope")).toThrow(RangeError);
  });

  it("clamps out-of-range score ratios", () => {
    const wild = [...session(0, 5, { scoreRatio: 3 }), ...session(1, 3, { scoreRatio: 3 })];
    expect(derive(wild).recentAccuracy).toBe(1);
  });
});

describe("deriveMastery", () => {
  it("derives every outcome separately, sorted by id, and can add not-started outcomes", () => {
    const evidence = [
      ...session(0, 5, { outcomeId: "b" }),
      ...session(1, 3, { outcomeId: "b" }),
      ...session(0, 3, { outcomeId: "a" }),
    ];
    const result = deriveMastery(evidence, now, ["c", "a"]);
    expect(result.map((r) => [r.outcomeId, r.state])).toEqual([
      ["a", "developing"],
      ["b", "mastered"],
      ["c", "not_started"],
    ]);
  });

  it("is deterministic: order of input does not matter and input is not changed", () => {
    const evidence = [...session(0, 5), ...session(1, 3), ...session(9, 2)];
    const shuffled = [...evidence].reverse();
    const copy = structuredClone(evidence);
    expect(deriveMastery(shuffled, now)).toEqual(deriveMastery(evidence, now));
    expect(deriveMastery(evidence, now)).toEqual(deriveMastery(evidence, new Date(now)));
    expect(evidence).toEqual(copy);
  });

  it("breaks timestamp ties the same way every time", () => {
    const same = Array.from({ length: 8 }, (_, i) =>
      item({ day: i < 5 ? 0 : 1, minute: 0, sessionId: i < 5 ? "s0" : "s1", familyId: i % 2 ? "f1" : "f2", scoreRatio: i % 3 === 0 ? 0 : 1 }),
    );
    const forward = deriveMastery(same, now);
    for (let k = 0; k < 5; k++) {
      const rotated = [...same.slice(k), ...same.slice(0, k)];
      expect(deriveMastery(rotated, now)).toEqual(forward);
    }
  });
});

describe("summariseTopic", () => {
  it("says improved when an outcome moved up", () => {
    const summary = summariseTopic("Fractions", [
      { outcomeId: "a", state: "almost_mastered", previousState: "developing" },
      { outcomeId: "b", state: "mastered", previousState: "mastered" },
    ]);
    expect(summary).toMatchObject({ status: "improved", improved: true, needsAttention: false, parts: ["Fractions improved"] });
  });

  it("says needs attention for learning and developing outcomes", () => {
    expect(summariseTopic("Length", [{ outcomeId: "a", state: "developing" }])).toMatchObject({
      status: "needs_attention",
      parts: ["Length still needs attention"],
    });
    expect(summariseTopic("Length", [{ outcomeId: "a", state: "learning" }]).needsAttention).toBe(true);
  });

  it("does not worry about an outcome that has only just begun", () => {
    const summary = summariseTopic("Length", [{ outcomeId: "a", state: "learning", evidenceCount: 1 }]);
    expect(summary.needsAttention).toBe(false);
    expect(summary.status).toBe("on_track");
  });

  it("treats a drop as needing attention", () => {
    expect(summariseTopic("Mass", [{ outcomeId: "a", state: "almost_mastered", previousState: "mastered" }])).toMatchObject({
      status: "needs_attention",
    });
  });

  it("can be both: improved with gaps", () => {
    const summary = summariseTopic("Fractions", [
      { outcomeId: "a", state: "mastered", previousState: "almost_mastered" },
      { outcomeId: "b", state: "developing", previousState: "developing" },
    ]);
    expect(summary.status).toBe("improved_with_gaps");
    expect(summary.parts).toEqual(["Fractions improved", "some Fractions skills still need attention"]);
    expect(summary.headline).toBe("Fractions improved · some Fractions skills still need attention");
  });

  it("covers not started, strong and on track", () => {
    expect(summariseTopic("Area", [{ outcomeId: "a", state: "not_started" }]).status).toBe("not_started");
    expect(summariseTopic("Area", []).status).toBe("not_started");
    expect(summariseTopic("Area", [{ outcomeId: "a", state: "retained" }, { outcomeId: "b", state: "mastered" }]).status).toBe("strong");
    expect(summariseTopic("Area", [{ outcomeId: "a", state: "almost_mastered" }]).status).toBe("on_track");
  });

  it("never puts numbers in the sentence", () => {
    const states = ["not_started", "learning", "developing", "almost_mastered", "mastered", "retained"] as const;
    for (const state of states) {
      for (const previousState of states) {
        const { parts } = summariseTopic("Fractions", [{ outcomeId: "a", state, previousState }]);
        expect(parts.join(" ")).not.toMatch(/\d|%/);
      }
    }
  });
});
