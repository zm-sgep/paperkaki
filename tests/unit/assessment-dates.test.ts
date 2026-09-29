import { describe, expect, it } from "vitest";
import {
  countdownText,
  daysBetween,
  formatAssessmentDate,
  isValidIsoDate,
  todayInSingapore,
  validateAssessmentDate,
} from "@/domain/assessments/dates";
import { deriveAssessmentName } from "@/domain/assessments/assessment-types";
import {
  assessmentStateText,
  contextLine,
  excludedTopicsNotice,
  joinLabels,
  summaryLine,
} from "@/domain/assessments/parent-copy";

describe("todayInSingapore", () => {
  it("uses the Singapore calendar day, not UTC", () => {
    // 17:00 UTC on the 28th is 01:00 on the 29th in Singapore.
    expect(todayInSingapore(new Date("2026-09-28T17:00:00Z"))).toBe("2026-09-29");
    expect(todayInSingapore(new Date("2026-09-28T15:59:59Z"))).toBe("2026-09-28");
  });
});

describe("date checks", () => {
  it("recognises real calendar days only", () => {
    expect(isValidIsoDate("2026-10-14")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("14/10/2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("accepts today and later, refuses the past, with plain messages", () => {
    const today = "2026-09-29";
    expect(validateAssessmentDate("2026-09-29", today)).toEqual({ ok: true });
    expect(validateAssessmentDate("2026-12-01", today)).toEqual({ ok: true });
    expect(validateAssessmentDate("2026-09-28", today)).toEqual({ ok: false, message: "Choose today or a later date." });
    expect(validateAssessmentDate("", today)).toEqual({ ok: false, message: "Choose the date of the assessment." });
    expect(validateAssessmentDate("soon", today).ok).toBe(false);
  });

  it("counts whole days across month, year and leap boundaries", () => {
    expect(daysBetween("2026-09-29", "2026-10-14")).toBe(15);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-10-14", "2026-09-29")).toBe(-15);
  });
});

describe("countdownText", () => {
  const today = "2026-09-29";
  it.each([
    ["2026-09-29", "today"],
    ["2026-09-30", "tomorrow"],
    ["2026-10-11", "in 12 days"],
    ["2026-09-28", "yesterday"],
    ["2026-09-26", "3 days ago"],
  ])("%s -> %s", (date, text) => {
    expect(countdownText(date, today)).toBe(text);
  });
});

describe("formatAssessmentDate", () => {
  it("writes weekday, day and month; adds the year only when it differs", () => {
    expect(formatAssessmentDate("2026-10-14")).toBe("Wed 14 Oct");
    expect(formatAssessmentDate("2026-10-14", "2026-09-29")).toBe("Wed 14 Oct");
    expect(formatAssessmentDate("2027-01-05", "2026-09-29")).toBe("Tue 5 Jan 2027");
  });
});

describe("deriveAssessmentName", () => {
  it("uses fixed labels for the standard types", () => {
    expect(deriveAssessmentName("wa2", undefined)).toEqual({ ok: true, name: "WA2" });
    expect(deriveAssessmentName("end_of_year", "ignored")).toEqual({ ok: true, name: "End-of-year exam" });
    expect(deriveAssessmentName("class_test", undefined)).toEqual({ ok: true, name: "Class test" });
  });

  it("needs a tidy name for Other", () => {
    expect(deriveAssessmentName("other", "  Topic   test ")).toEqual({ ok: true, name: "Topic test" });
    expect(deriveAssessmentName("other", " ").ok).toBe(false);
    expect(deriveAssessmentName("other", "x".repeat(41)).ok).toBe(false);
  });
});

describe("parent copy", () => {
  it("joins labels in plain English", () => {
    expect(joinLabels([])).toBe("");
    expect(joinLabels(["Fractions"])).toBe("Fractions");
    expect(joinLabels(["Fractions", "Time"])).toBe("Fractions and Time");
    expect(joinLabels(["Fractions", "Time", "Angles"])).toBe("Fractions, Time and Angles");
  });

  it("writes the one-line summary", () => {
    expect(summaryLine({ totalMarks: 40, durationMinutes: 45, topicLabels: ["Fractions", "Time", "Measurement"] })).toBe(
      "40 marks · 45 minutes · Fractions, Time, Measurement",
    );
  });

  it("names left-out topics calmly and says nothing when none are left out", () => {
    expect(excludedTopicsNotice([], 3)).toBeNull();
    expect(excludedTopicsNotice(["Angles"], 3)).toBe("We can't include Angles yet, so this mock covers the other 3 topics.");
    expect(excludedTopicsNotice(["Angles"], 1)).toBe("We can't include Angles yet, so this mock covers the other topic.");
    expect(excludedTopicsNotice(["Angles", "Time"], 2)).toBe(
      "We can't include Angles and Time yet, so this mock covers the other 2 topics.",
    );
  });

  it("writes the context line and state words", () => {
    expect(contextLine({ childNickname: "Darius", subject: "Mathematics", name: "WA2", dateText: "Tue 14 Oct" })).toBe(
      "Darius · Mathematics WA2 · Tue 14 Oct",
    );
    expect(assessmentStateText(false)).toBe("Choose topics");
    expect(assessmentStateText(true)).toBe("Topics confirmed");
  });
});
