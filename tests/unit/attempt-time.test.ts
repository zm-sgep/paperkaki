import { describe, expect, it } from "vitest";
import {
  attemptLabel,
  elapsedSecondsSince,
  formatDuration,
  handedInText,
  inProgressOnIpadText,
  overTimeSecondsFor,
  remainingSecondsFor,
  waitingOnTodayText,
} from "@/domain/attempts";

const start = new Date("2026-09-30T02:00:00Z");
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

describe("server-anchored mock clock", () => {
  it("counts whole seconds from Start and never goes negative", () => {
    expect(elapsedSecondsSince(start, start)).toBe(0);
    expect(elapsedSecondsSince(start, new Date(start.getTime() + 1999))).toBe(1);
    expect(elapsedSecondsSince(start, at(90 * 60))).toBe(5400);
    expect(elapsedSecondsSince(start, at(-30))).toBe(0);
  });

  it("remaining = limit - elapsed, never below zero, with no pause", () => {
    const limit = 45 * 60;
    expect(remainingSecondsFor(limit, 0)).toBe(2700);
    expect(remainingSecondsFor(limit, 600)).toBe(2100);
    expect(remainingSecondsFor(limit, 2700)).toBe(0);
    expect(remainingSecondsFor(limit, 3000)).toBe(0);
    // A clock that reads slightly negative cannot add time.
    expect(remainingSecondsFor(limit, -5)).toBe(2700);
  });

  it("records over-time seconds only past the limit", () => {
    const limit = 45 * 60;
    expect(overTimeSecondsFor(limit, 100)).toBe(0);
    expect(overTimeSecondsFor(limit, limit)).toBe(0);
    expect(overTimeSecondsFor(limit, limit + 1)).toBe(1);
    expect(overTimeSecondsFor(limit, limit + 754)).toBe(754);
    expect(overTimeSecondsFor(limit, -10)).toBe(0);
  });

  it("puts elapsed and over-time together the way submit does", () => {
    const limit = 3600;
    const elapsed = elapsedSecondsSince(start, at(limit + 125));
    expect(remainingSecondsFor(limit, elapsed)).toBe(0);
    expect(overTimeSecondsFor(limit, elapsed)).toBe(125);
  });

  it("says durations the way a parent and child read them", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(0)).toBe("0 min");
  });
});

describe("attempt wording", () => {
  it("names the paper and where the mock is", () => {
    expect(attemptLabel("Mathematics", "WA2", 1)).toBe("Mathematics WA2 · Mock 1");
    expect(waitingOnTodayText(1, "Darius")).toBe("Mock 1 is waiting on Darius's Today screen.");
    expect(inProgressOnIpadText(2, "Darius")).toBe("Darius is doing Mock 2 on the iPad.");
    expect(handedInText(2, "Darius")).toBe("Darius handed in Mock 2.");
  });
});
