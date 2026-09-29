import { describe, expect, it } from "vitest";
import { CurriculumPublishRefusedError, decidePublish, type PublishCandidateOutcome } from "@/domain/curriculum";

const outcome = (code: string, sourceLinkCount: number, verification: "verified" | "unverified"): PublishCandidateOutcome => ({
  code,
  sourceLinkCount,
  verification,
});

function refusal(run: () => unknown): CurriculumPublishRefusedError {
  try {
    run();
  } catch (error) {
    if (error instanceof CurriculumPublishRefusedError) return error;
    throw error;
  }
  throw new Error("expected publishing to be refused");
}

describe("decidePublish", () => {
  const verified = [outcome("A", 1, "verified"), outcome("B", 2, "verified")];
  const oneUnverified = [outcome("A", 1, "verified"), outcome("B", 1, "unverified")];

  it("refuses a version with no outcomes", () => {
    expect(refusal(() => decidePublish({ outcomes: [], allowUnverified: true, nodeEnv: "development" })).reason).toBe("no_outcomes");
  });

  it("refuses an outcome with no source link, whatever the flags say", () => {
    for (const nodeEnv of ["development", "test", "production", undefined]) {
      const error = refusal(() =>
        decidePublish({ outcomes: [outcome("A", 1, "verified"), outcome("NO-SRC", 0, "verified")], allowUnverified: true, nodeEnv }),
      );
      expect(error.reason).toBe("outcomes_without_source");
      expect(error.codes).toEqual(["NO-SRC"]);
      expect(error.message).toContain("NO-SRC");
    }
  });

  it("publishes verified outcomes in production", () => {
    expect(decidePublish({ outcomes: verified, allowUnverified: false, nodeEnv: "production" })).toEqual({ unverifiedCount: 0 });
  });

  it("refuses unverified outcomes when the flag is off", () => {
    const error = refusal(() => decidePublish({ outcomes: oneUnverified, allowUnverified: false, nodeEnv: "development" }));
    expect(error.reason).toBe("unverified_outcomes");
    expect(error.count).toBe(1);
    expect(error.codes).toEqual(["B"]);
  });

  it("allows unverified outcomes with the flag in development and test, and counts them", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(decidePublish({ outcomes: oneUnverified, allowUnverified: true, nodeEnv })).toEqual({ unverifiedCount: 1 });
    }
  });

  it("refuses unverified outcomes in production even with the flag (ADR-0012)", () => {
    const error = refusal(() => decidePublish({ outcomes: oneUnverified, allowUnverified: true, nodeEnv: "production" }));
    expect(error.reason).toBe("unverified_in_production");
    expect(error.message).toMatch(/Production cannot contain unverified curriculum/);
  });

  it("names at most a handful of outcome codes in the message", () => {
    const many = Array.from({ length: 20 }, (_, index) => outcome(`X${index}`, 1, "unverified"));
    const error = refusal(() => decidePublish({ outcomes: many, allowUnverified: false, nodeEnv: "development" }));
    expect(error.count).toBe(20);
    expect(error.codes).toHaveLength(20);
    expect(error.message).toContain("and 12 more");
  });
});
