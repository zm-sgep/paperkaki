import { describe, expect, it } from "vitest";
import {
  FEEDBACK_HEADING,
  MAX_ACTIVE_GAP_SECONDS,
  activeGapSeconds,
  minutesText,
  nextButtonLabel,
  practiceEndText,
  practiceHint,
  practiceProgressText,
  practisedMinutes,
} from "@/domain/recommendations";
import type { Block } from "@/schemas/question-content";

const step = (text: string): Block => ({ t: "p", c: [{ t: "text", v: text }] });

describe("practice copy", () => {
  it("ends calmly: Good work. You practised Fractions for 14 minutes.", () => {
    expect(practiceEndText("Fractions", 14)).toBe("Good work. You practised Fractions for 14 minutes.");
    expect(practiceEndText("Length", 1)).toBe("Good work. You practised Length for 1 minute.");
    expect(minutesText(15)).toBe("15 minutes");
  });

  it("counts working time, not waiting time", () => {
    const start = new Date("2026-10-01T02:00:00Z");
    expect(activeGapSeconds(start, new Date("2026-10-01T02:01:00Z"))).toBe(60);
    expect(activeGapSeconds(start, new Date("2026-10-01T05:00:00Z"))).toBe(MAX_ACTIVE_GAP_SECONDS);
    expect(activeGapSeconds(start, new Date("2026-10-01T01:59:00Z"))).toBe(0);
    expect(practisedMinutes(0)).toBe(1);
    expect(practisedMinutes(14 * 60 + 20)).toBe(14);
  });

  it("hints with the first step of the working, never the whole solution", () => {
    expect(practiceHint([step("First"), step("Second"), step("Third")])).toEqual({ kind: "step", blocks: [step("First")] });
  });

  it("nudges instead when the solution is a single step, which would give the answer away", () => {
    expect(practiceHint([step("Only step")])).toEqual({ kind: "nudge", text: "Read the question once more, and take it one step at a time." });
    expect(practiceHint([]).kind).toBe("nudge");
  });

  it("uses plain, kind feedback words with no points or mastery talk", () => {
    expect(FEEDBACK_HEADING.wrong).toBe("Not quite");
    expect(Object.values(FEEDBACK_HEADING).join(" ")).not.toMatch(/point|master|wrong|fail|score/i);
    expect(practiceProgressText(3, 8)).toBe("Question 3 of 8");
    expect(nextButtonLabel(true)).toBe("Finish");
    expect(nextButtonLabel(false)).toBe("Next question");
  });
});
