import { describe, expect, it } from "vitest";
import {
  END_OF_YEAR_COMMON_FORMAT,
  WEIGHTED_COMMON_FORMAT,
  durationText,
  formatChoiceTitle,
  formatKindsText,
  formatPartsText,
  formatSummaryLine,
  formatTotalMarks,
  hasBannedParentWording,
  normalisePaperFormat,
  paperFormatChoices,
  presetFormat,
  questionKindOf,
  recommendPaperFormat,
  sameFormat,
  standardFormat,
  validatePaperFormat,
  type FormatSection,
  type PaperFormat,
} from "@/domain/assessments";
import { PaperFormatSchema, parsePaperFormat } from "@/schemas/paper-format";

const fmt = (sections: FormatSection[], durationMinutes = 60): PaperFormat => ({ durationMinutes, sections });
const section = (over: Partial<FormatSection> = {}): FormatSection => ({
  label: "Section A",
  kind: "short",
  questionCount: 10,
  totalMarks: 15,
  ...over,
});

describe("questionKindOf", () => {
  it("is mcq for multiple choice whatever the marks", () => {
    expect(questionKindOf({ questionType: "mcq", marks: 1 })).toBe("mcq");
    expect(questionKindOf({ questionType: "mcq", marks: 2 })).toBe("mcq");
  });
  it("is word_problem for open questions worth 3 or more, short otherwise", () => {
    expect(questionKindOf({ questionType: "number", marks: 1 })).toBe("short");
    expect(questionKindOf({ questionType: "fraction", marks: 2 })).toBe("short");
    expect(questionKindOf({ questionType: "text", marks: 3 })).toBe("word_problem");
    expect(questionKindOf({ questionType: "number", marks: 4 })).toBe("word_problem");
  });
});

describe("presets", () => {
  it("the common end-of-year format is the real 50 mark, 90 minute, three-section paper", () => {
    expect(formatTotalMarks(END_OF_YEAR_COMMON_FORMAT)).toBe(50);
    expect(END_OF_YEAR_COMMON_FORMAT.durationMinutes).toBe(90);
    expect(END_OF_YEAR_COMMON_FORMAT.sections.map((s) => [s.label, s.kind, s.questionCount, s.totalMarks])).toEqual([
      ["Section A", "mcq", 6, 12],
      ["Section B", "short", 16, 26],
      ["Section C", "word_problem", 4, 12],
    ]);
    expect(validatePaperFormat(END_OF_YEAR_COMMON_FORMAT)).toEqual([]);
  });

  it("the weighted format is 20 marks in 30 minutes", () => {
    expect(formatTotalMarks(WEIGHTED_COMMON_FORMAT)).toBe(20);
    expect(WEIGHTED_COMMON_FORMAT.durationMinutes).toBe(30);
    expect(validatePaperFormat(WEIGHTED_COMMON_FORMAT)).toEqual([]);
  });

  it("every standard format is valid for every allowed total, and scales with the topic count", () => {
    for (let total = 10; total <= 60; total += 5) {
      const f = standardFormat({ totalMarks: total, durationMinutes: total + 5 });
      expect(validatePaperFormat(f), `total ${total}`).toEqual([]);
      expect(formatTotalMarks(f)).toBe(total);
      expect(f.sections.map((s) => s.kind)).toEqual(["mcq", "short"]);
    }
    expect(formatTotalMarks(presetFormat("standard", { topicCount: 1 }))).toBe(20);
    expect(formatTotalMarks(presetFormat("standard", { topicCount: 2 }))).toBe(30);
    expect(formatTotalMarks(presetFormat("standard", { topicCount: 5 }))).toBe(40);
  });

  it("returns copies, so a preset cannot be changed by accident", () => {
    const a = presetFormat("p3_end_of_year_common", { topicCount: 3 });
    a.sections[0]!.label = "Changed";
    expect(END_OF_YEAR_COMMON_FORMAT.sections[0]?.label).toBe("Section A");
  });
});

describe("recommendation", () => {
  it("recommends the end-of-year format for an end-of-year exam", () => {
    expect(recommendPaperFormat({ assessmentType: "end_of_year", topicCount: 5 }).choice).toBe("p3_end_of_year_common");
  });
  it("recommends the standard mock for weighted assessments, class tests and other", () => {
    for (const type of ["wa1", "wa2", "wa3", "class_test", "other"] as const) {
      const r = recommendPaperFormat({ assessmentType: type, topicCount: 3 });
      expect(r.choice).toBe("standard");
      expect(formatTotalMarks(r.format)).toBe(40);
    }
  });
  it("recommends the child's saved format first", () => {
    const saved = fmt([section({ label: "Paper 1", totalMarks: 20, questionCount: 12 })], 40);
    for (const type of ["end_of_year", "wa2"] as const) {
      const r = recommendPaperFormat({ assessmentType: type, topicCount: 3, savedFormat: saved });
      expect(r.choice).toBe("saved");
      expect(r.format).toEqual(saved);
    }
  });
  it("lists the recommended choice first and only once", () => {
    const eoy = paperFormatChoices({ assessmentType: "end_of_year", topicCount: 4 });
    expect(eoy.map((c) => c.id)).toEqual(["p3_end_of_year_common", "standard", "p3_weighted_common"]);
    expect(eoy.map((c) => c.recommended)).toEqual([true, false, false]);
    const wa = paperFormatChoices({ assessmentType: "wa2", topicCount: 4 });
    expect(wa[0]?.id).toBe("standard");
    const saved = paperFormatChoices({
      assessmentType: "wa2",
      topicCount: 4,
      savedFormat: fmt([section()]),
    });
    expect(saved[0]).toMatchObject({ id: "saved", recommended: true });
    expect(saved).toHaveLength(4);
    // A saved format that equals a preset does not show that preset twice.
    const same = paperFormatChoices({ assessmentType: "wa2", topicCount: 4, savedFormat: END_OF_YEAR_COMMON_FORMAT });
    expect(same.map((c) => c.id)).toEqual(["saved", "standard", "p3_weighted_common"]);
  });
});

describe("validatePaperFormat", () => {
  it("says exactly what to change when the marks cannot be reached", () => {
    const issues = validatePaperFormat(fmt([section({ label: "Section B", questionCount: 16, totalMarks: 40 })]));
    expect(issues.map((i) => i.message)).toContain(
      "Section B: 16 questions can't add up to 40 marks. Short questions are worth 1 or 2 marks, so use 16 to 32 marks.",
    );
    expect(issues[0]).toMatchObject({ code: "marks_unreachable", sectionIndex: 0 });
  });

  it("uses each kind's own marks", () => {
    const mcq = validatePaperFormat(fmt([section({ kind: "mcq", questionCount: 4, totalMarks: 12 })]));
    expect(mcq[0]?.message).toContain("Multiple choice questions are worth 1 or 2 marks, so use 4 to 8 marks.");
    const wp = validatePaperFormat(fmt([section({ kind: "word_problem", questionCount: 4, totalMarks: 30 })]));
    expect(wp[0]?.message).toContain("Word problems are worth 3, 4 or 5 marks, so use 12 to 20 marks.");
    expect(validatePaperFormat(fmt([section({ kind: "word_problem", questionCount: 1, totalMarks: 4 }), section({ label: "B", questionCount: 10, totalMarks: 10 })]))).toEqual([]);
  });

  it("accepts every reachable total and rejects the ones outside the range", () => {
    for (const kind of ["mcq", "short", "word_problem"] as const) {
      const lo = kind === "word_problem" ? 3 : 1;
      const hi = kind === "word_problem" ? 5 : 2;
      for (const count of [1, 5, 10]) {
        for (let total = 1; total <= 100; total += 1) {
          const f = fmt([section({ kind, questionCount: count, totalMarks: total }), section({ label: "Section B", kind: "short", questionCount: 20, totalMarks: 30 })]);
          const reachable = total >= count * lo && total <= count * hi;
          const flagged = validatePaperFormat(f).some((i) => i.code === "marks_unreachable" && i.sectionIndex === 0);
          expect(flagged, `${kind} ${count} ${total}`).toBe(!reachable);
        }
      }
    }
  });

  it("needs at least one part, a sensible time and a total between 10 and 60", () => {
    expect(validatePaperFormat(fmt([])).map((i) => i.code)).toEqual(["no_sections"]);
    expect(validatePaperFormat(fmt([section({ totalMarks: 15 })], 5)).map((i) => i.code)).toContain("duration_out_of_range");
    expect(validatePaperFormat(fmt([section({ questionCount: 5, totalMarks: 8 })])).map((i) => i.code)).toContain("total_out_of_range");
    const big = fmt(Array.from({ length: 4 }, (_, i) => section({ label: `Part ${i + 1}`, questionCount: 20, totalMarks: 20 })));
    expect(validatePaperFormat(big).map((i) => i.message).join(" ")).toContain("between 10 and 60 marks. This one is 80 marks.");
  });

  it("checks the parts against the paper's total when told", () => {
    const f = END_OF_YEAR_COMMON_FORMAT;
    expect(validatePaperFormat(f, { expectedTotalMarks: 50 })).toEqual([]);
    const issues = validatePaperFormat(f, { expectedTotalMarks: 40 });
    expect(issues.map((i) => i.code)).toEqual(["total_mismatch"]);
    expect(issues[0]?.message).toContain("50 marks");
  });

  it("asks for a name, and for different names", () => {
    expect(validatePaperFormat(fmt([section({ label: "  " })])).map((i) => i.code)).toContain("label_missing");
    expect(validatePaperFormat(fmt([section({ label: "x".repeat(31) })])).map((i) => i.code)).toContain("label_too_long");
    const dup = validatePaperFormat(fmt([section({ label: "Section A" }), section({ label: "section a" })]));
    expect(dup.filter((i) => i.code === "label_duplicate").map((i) => i.sectionIndex)).toEqual([0, 1]);
  });

  it("keeps booklets to neighbouring parts", () => {
    const ok = fmt([
      section({ label: "Section A", booklet: "Booklet A", questionCount: 10, totalMarks: 10 }),
      section({ label: "Section B", booklet: "Booklet A", questionCount: 10, totalMarks: 10 }),
      section({ label: "Section C", booklet: "Booklet B", questionCount: 10, totalMarks: 10 }),
    ]);
    expect(validatePaperFormat(ok)).toEqual([]);
    const split = fmt([
      section({ label: "Section A", booklet: "Booklet A", questionCount: 10, totalMarks: 10 }),
      section({ label: "Section B", booklet: "Booklet B", questionCount: 10, totalMarks: 10 }),
      section({ label: "Section C", booklet: "Booklet A", questionCount: 10, totalMarks: 10 }),
    ]);
    const issues = validatePaperFormat(split);
    expect(issues.map((i) => [i.code, i.sectionIndex])).toEqual([["booklet_split", 2]]);
    const gap = fmt([
      section({ label: "Section A", booklet: "Booklet A", questionCount: 10, totalMarks: 10 }),
      section({ label: "Section B", questionCount: 10, totalMarks: 10 }),
      section({ label: "Section C", booklet: "Booklet A", questionCount: 10, totalMarks: 10 }),
    ]);
    expect(validatePaperFormat(gap).map((i) => i.code)).toEqual(["booklet_split"]);
  });

  it("checks marks-each against the count and total", () => {
    const bad = fmt([section({ kind: "mcq", questionCount: 6, totalMarks: 11, marksEach: 2 }), section({ label: "Section B", questionCount: 10, totalMarks: 10 })]);
    expect(validatePaperFormat(bad)[0]).toMatchObject({ code: "marks_each", sectionIndex: 0 });
  });

  it("never uses internal words in a message", () => {
    const messages = validatePaperFormat(
      fmt([section({ label: "", questionCount: 0, totalMarks: 200 }), section({ label: "B", kind: "word_problem", questionCount: 3, totalMarks: 30 })], 500),
    ).map((i) => i.message);
    expect(messages.length).toBeGreaterThan(3);
    for (const m of messages) expect(m).not.toMatch(/blueprint|outcome|inventory|kind|preset|undefined|NaN/i);
  });
});

describe("normalisePaperFormat and sameFormat", () => {
  it("trims names, drops blank booklets and keeps marks-each only while it explains the marks", () => {
    const n = normalisePaperFormat(
      fmt([
        section({ label: "  Section   A ", booklet: "   ", kind: "mcq", questionCount: 6, totalMarks: 12, marksEach: 2 }),
        section({ label: "Section B", kind: "mcq", questionCount: 8, totalMarks: 12, marksEach: 2 }),
      ]),
    );
    expect(n.sections[0]).toEqual({ label: "Section A", kind: "mcq", questionCount: 6, totalMarks: 12, marksEach: 2 });
    expect(n.sections[1]).toEqual({ label: "Section B", kind: "mcq", questionCount: 8, totalMarks: 12 });
  });
  it("compares formats by content", () => {
    expect(sameFormat(END_OF_YEAR_COMMON_FORMAT, presetFormat("p3_end_of_year_common", { topicCount: 1 }))).toBe(true);
    expect(sameFormat(END_OF_YEAR_COMMON_FORMAT, WEIGHTED_COMMON_FORMAT)).toBe(false);
  });
});

describe("schema", () => {
  it("accepts a valid format and returns it tidy", () => {
    const parsed = parsePaperFormat({ durationMinutes: 90, sections: [{ label: " Section A ", booklet: "", kind: "mcq", questionCount: 6, totalMarks: 12, marksEach: 2 }] });
    expect(parsed).toEqual({ durationMinutes: 90, sections: [{ label: "Section A", kind: "mcq", questionCount: 6, totalMarks: 12, marksEach: 2 }] });
  });
  it("round-trips every preset", () => {
    for (const f of [END_OF_YEAR_COMMON_FORMAT, WEIGHTED_COMMON_FORMAT, standardFormat({ totalMarks: 40, durationMinutes: 45 })]) {
      expect(parsePaperFormat(JSON.parse(JSON.stringify(f)))).toEqual(f);
    }
  });
  it("rejects the wrong shape", () => {
    for (const bad of [
      null,
      "x",
      { durationMinutes: 90 },
      { durationMinutes: 90, sections: [] },
      { durationMinutes: 90.5, sections: [section()] },
      { durationMinutes: 90, sections: [{ ...section(), kind: "essay" }] },
      { durationMinutes: 90, sections: [{ ...section(), questionCount: 41 }] },
      { durationMinutes: 90, sections: [{ ...section(), totalMarks: 101 }] },
      { durationMinutes: 90, sections: [{ ...section(), label: "" }] },
      { durationMinutes: 90, sections: [{ ...section(), extra: 1 }] },
    ]) {
      expect(PaperFormatSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("parent wording", () => {
  it("writes durations", () => {
    expect(durationText(45)).toBe("45 min");
    expect(durationText(60)).toBe("1 h");
    expect(durationText(90)).toBe("1 h 30 min");
    expect(durationText(120)).toBe("2 h");
  });
  it("writes the one-line summary", () => {
    expect(formatSummaryLine(END_OF_YEAR_COMMON_FORMAT)).toBe("50 marks · 1 h 30 min · Sections A, B, C");
    expect(formatSummaryLine(WEIGHTED_COMMON_FORMAT)).toBe("20 marks · 30 min · Sections A, B");
    const booklets = fmt([
      section({ label: "Section A", booklet: "Booklet A", questionCount: 10, totalMarks: 10 }),
      section({ label: "Section B", booklet: "Booklet A", questionCount: 10, totalMarks: 10 }),
      section({ label: "Section C", booklet: "Booklet B", questionCount: 10, totalMarks: 10 }),
    ]);
    expect(formatPartsText(booklets)).toBe("Booklet A, Booklet B");
    expect(formatPartsText(fmt([section({ label: "Paper 1" }), section({ label: "Paper 2" })]))).toBe("Paper 1, Paper 2");
    expect(formatPartsText(fmt([section({ label: "Section A" })]))).toBe("Section A");
  });
  it("labels the ready-made choices in the school's words", () => {
    expect(formatChoiceTitle("p3_end_of_year_common", END_OF_YEAR_COMMON_FORMAT)).toBe(
      "Common Primary 3 end-of-year format (Sections A, B, C · 50 marks · 1 h 30 min)",
    );
    expect(formatChoiceTitle("p3_weighted_common", WEIGHTED_COMMON_FORMAT)).toBe("Short weighted assessment (20 marks · 30 min)");
    expect(formatKindsText(END_OF_YEAR_COMMON_FORMAT)).toBe("6 multiple choice · 16 short answer · 4 word problems");
  });
  it("keeps banned internal words out of the copy", () => {
    for (const text of [
      formatSummaryLine(END_OF_YEAR_COMMON_FORMAT),
      formatChoiceTitle("standard", standardFormat({ totalMarks: 40, durationMinutes: 45 })),
      formatKindsText(WEIGHTED_COMMON_FORMAT),
    ]) {
      expect(text).not.toMatch(/blueprint|outcome|inventory|preset|kind|%/i);
    }
    expect(hasBannedParentWording).toBeTypeOf("function");
  });
});
