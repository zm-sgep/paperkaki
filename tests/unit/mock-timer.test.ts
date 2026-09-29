import { describe, expect, it } from "vitest";
import { PALM_GUARD_MS, effectivePressure, pointerKind, shouldAcceptPointer } from "@/components/mock/pointer-policy";
import { formatClock, remainingSeconds, spokenClock, timerPhase } from "@/components/mock/timer";

describe("formatClock", () => {
  it.each([
    [2700, "45:00"],
    [545, "9:05"],
    [59, "0:59"],
    [0, "0:00"],
    [-12, "0:00"],
    [3900, "1:05:00"],
    [599.2, "10:00"],
    [Number.NaN, "0:00"],
  ])("%s seconds reads %s", (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });

  it("speaks the time for screen readers", () => {
    expect(spokenClock(545)).toBe("9 minutes 5 seconds");
    expect(spokenClock(60)).toBe("1 minute");
    expect(spokenClock(3900)).toBe("1 hour 5 minutes");
    expect(spokenClock(0)).toBe("0 seconds");
  });
});

describe("timer phases", () => {
  it("counts down and never goes below zero", () => {
    expect(remainingSeconds(2700, 100)).toBe(2600);
    expect(remainingSeconds(2700, 9999)).toBe(0);
  });

  it("stays calm, turns amber at ten minutes, shows one banner at five, and is gentle when time is up", () => {
    expect(timerPhase(601)).toEqual({ tone: "calm", banner: "none" });
    expect(timerPhase(600)).toEqual({ tone: "amber", banner: "none" });
    expect(timerPhase(301)).toEqual({ tone: "amber", banner: "none" });
    expect(timerPhase(300)).toEqual({ tone: "amber", banner: "five-minutes" });
    expect(timerPhase(0)).toEqual({ tone: "amber", banner: "time-up" });
  });
});

describe("palm rejection", () => {
  const idle = { penDown: false, lastPenEventAt: null };

  it("lets a pen and a mouse always draw", () => {
    expect(shouldAcceptPointer("pen", { penDown: true, lastPenEventAt: 0 }, 1)).toBe(true);
    expect(shouldAcceptPointer("mouse", { penDown: true, lastPenEventAt: 0 }, 1)).toBe(true);
  });

  it("lets a finger draw when no pen has been used", () => {
    expect(shouldAcceptPointer("touch", idle, 5000)).toBe(true);
  });

  it("ignores a finger while the pen is down and just after it lifts", () => {
    expect(shouldAcceptPointer("touch", { penDown: true, lastPenEventAt: 100 }, 5000)).toBe(false);
    expect(shouldAcceptPointer("touch", { penDown: false, lastPenEventAt: 1000 }, 1000 + PALM_GUARD_MS - 1)).toBe(false);
    expect(shouldAcceptPointer("touch", { penDown: false, lastPenEventAt: 1000 }, 1000 + PALM_GUARD_MS + 1)).toBe(true);
  });

  it("classifies pointer types and pressure", () => {
    expect(pointerKind("pen")).toBe("pen");
    expect(pointerKind("touch")).toBe("touch");
    expect(pointerKind("mouse")).toBe("mouse");
    expect(pointerKind("")).toBe("mouse");
    expect(effectivePressure("pen", 0.8)).toBe(0.8);
    expect(effectivePressure("pen", 0)).toBe(0.5);
    expect(effectivePressure("touch", 0.9)).toBe(0.5);
  });
});
