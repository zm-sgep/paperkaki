import { MASTERY_POLICY_V1 as P } from "./policy";
import type { MasteryEvidence, MasteryState, OutcomeMastery } from "./types";

export type Instant = string | Date;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** What the rules look at. Computed from first-attempt evidence only. */
export type MasteryMetrics = {
  items: number;
  sessions: number;
  days: number;
  families: number;
  nonBasicItems: number;
  /** Weighted recent accuracy 0..1. */
  accuracy: number;
};

/**
 * The state rule table. Evaluated top to bottom; the first rule whose `when` is true decides.
 * Read it as the whole policy on one screen.
 */
export const MASTERY_STATE_RULES: readonly { id: string; state: MasteryState; when: (m: MasteryMetrics) => boolean }[] = [
  { id: "too_little_evidence", state: "learning", when: (m) => m.items < P.minItemsForBands },
  { id: "low_accuracy", state: "learning", when: (m) => m.accuracy < P.bands.developing },
  { id: "medium_accuracy", state: "developing", when: (m) => m.accuracy < P.bands.almostMastered },
  { id: "one_session_ceiling", state: P.singleSessionCeiling, when: (m) => m.sessions < 2 },
  {
    id: "mastered",
    state: "mastered",
    when: (m) =>
      m.accuracy >= P.bands.mastered &&
      m.items >= P.masteredNeeds.minItems &&
      m.sessions >= P.masteredNeeds.minSessions &&
      m.days >= P.masteredNeeds.minDays &&
      m.families >= P.masteredNeeds.minFamilies &&
      m.nonBasicItems >= P.masteredNeeds.minNonBasicItems,
  },
  { id: "almost_mastered", state: "almost_mastered", when: () => true },
];

function toMs(value: Instant, what: string): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid ${what}: ${String(value)}`);
  return ms;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Singapore calendar day of a timestamp, "YYYY-MM-DD". */
function dayKey(ms: number): string {
  return new Date(ms + P.dayBoundaryUtcOffsetHours * HOUR_MS).toISOString().slice(0, 10);
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type Item = MasteryEvidence & { ms: number; ratio: number };

function prepare(evidence: readonly MasteryEvidence[], nowMs: number): Item[] {
  return evidence
    .map((e) => {
      const ms = toMs(e.at, "evidence timestamp");
      if (!Number.isFinite(e.scoreRatio)) throw new RangeError(`Invalid scoreRatio for ${e.questionId}`);
      return { ...e, ms, ratio: Math.min(1, Math.max(0, e.scoreRatio)) };
    })
    .filter((e) => e.ms <= nowMs)
    .sort((a, b) => a.ms - b.ms || compareText(a.questionId, b.questionId) || compareText(a.sessionId, b.sessionId));
}

/** Metrics over first-attempt items in chronological order. */
function computeMetrics(items: readonly Item[]): MasteryMetrics {
  const recent = items.slice(-P.recentWindow).reverse(); // newest first
  let weighted = 0;
  let weights = 0;
  recent.forEach((item, rank) => {
    const w = P.difficultyWeight[item.difficulty] * P.recencyDecay ** rank;
    weighted += w * item.ratio;
    weights += w;
  });
  return {
    items: items.length,
    sessions: new Set(items.map((i) => i.sessionId)).size,
    days: new Set(items.map((i) => dayKey(i.ms))).size,
    families: new Set(items.map((i) => i.familyId)).size,
    nonBasicItems: items.filter((i) => i.difficulty !== "basic").length,
    accuracy: weights === 0 ? 0 : weighted / weights,
  };
}

/** State before the retention rule (never "retained"). */
export function stateFromMetrics(metrics: MasteryMetrics): MasteryState {
  const rule = MASTERY_STATE_RULES.find((r) => r.when(metrics));
  return (rule as (typeof MASTERY_STATE_RULES)[number]).state;
}

/** Derive one outcome's mastery from its evidence (all of it belongs to `outcomeId`). */
export function deriveOutcomeMastery(outcomeId: string, evidence: readonly MasteryEvidence[], now: Instant): OutcomeMastery {
  const nowMs = toMs(now, "now");
  const all = prepare(evidence.filter((e) => e.outcomeId === outcomeId), nowMs);
  if (all.length === 0) return { outcomeId, state: "not_started", evidenceCount: 0, sessions: 0 };

  const counted = all.filter((e) => e.firstAttempt);
  const lastPracticedAt = iso(all[all.length - 1]!.ms);

  // Replay so we know on which day mastery was first reached (and kept).
  let masteredAtMs: number | undefined;
  for (let k = 1; k <= counted.length; k++) {
    const state = stateFromMetrics(computeMetrics(counted.slice(0, k)));
    if (state === "mastered") masteredAtMs ??= counted[k - 1]!.ms;
    else masteredAtMs = undefined;
  }

  const metrics = computeMetrics(counted);
  let state = stateFromMetrics(metrics);
  const result: OutcomeMastery = {
    outcomeId,
    state,
    evidenceCount: metrics.items,
    sessions: metrics.sessions,
    lastPracticedAt,
    recentAccuracy: metrics.accuracy,
  };

  if (state === "mastered" && masteredAtMs !== undefined) {
    // Spaced retention: the first check is due 7 days after mastery, later ones 21 days after the last passed check.
    const intervals = P.retention.reviewIntervalsDays;
    const intervalFor = (passed: number) => (intervals[Math.min(passed, intervals.length - 1)] as number) * DAY_MS;
    let lastCheckMs = masteredAtMs;
    let passed = 0;
    for (const item of counted) {
      if (item.ms > masteredAtMs && item.ratio >= P.retention.minScoreRatio && item.ms >= lastCheckMs + intervalFor(passed)) {
        passed += 1;
        lastCheckMs = item.ms;
      }
    }
    if (passed > 0) state = "retained";
    result.state = state;
    result.masteredAt = iso(masteredAtMs);
    result.reviewDueAt = iso(lastCheckMs + intervalFor(passed));
  }
  return result;
}

/**
 * Derive mastery for every outcome that has evidence, sorted by outcome id. Pass `outcomeIds`
 * (the outcomes in scope) to include outcomes with no evidence yet as `not_started`.
 */
export function deriveMastery(
  evidence: readonly MasteryEvidence[],
  now: Instant,
  outcomeIds: readonly string[] = [],
): OutcomeMastery[] {
  const ids = new Set<string>(outcomeIds);
  for (const e of evidence) ids.add(e.outcomeId);
  return [...ids]
    .sort(compareText)
    .map((id) => deriveOutcomeMastery(id, evidence, now));
}
