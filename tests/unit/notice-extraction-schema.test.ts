import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { NoticeExtractionModelSchema, NoticeExtractionSchema, TopicMappingModelSchema, TopicMappingSchema } from "@/schemas/notice-extraction";

const maths = {
  subject: "Mathematics",
  assessmentType: "end_of_year",
  date: "2026-10-27",
  startTime: "08:00",
  durationMinutes: 90,
  topics: [{ schoolLabel: "Fractions", confident: true }],
  format: {
    sections: [{ label: "Section A", kind: "mcq", wording: "Multiple-Choice questions", questionCount: 6, totalMarks: 12, confident: true }],
    totalMarks: 50,
  },
  notes: ["Protractors are not allowed"],
};

describe("NoticeExtractionSchema", () => {
  it("accepts a full Mathematics entry and a document year", () => {
    const parsed = NoticeExtractionSchema.parse({ subjects: [maths], documentYear: 2026 });
    expect(parsed.subjects[0]?.format?.sections[0]?.kind).toBe("mcq");
    expect(parsed.documentYear).toBe(2026);
  });

  it("reads null and missing optional fields as not found", () => {
    const parsed = NoticeExtractionSchema.parse({
      subjects: [{ subject: "Mathematics", date: null, format: null, assessmentType: null, topics: [], notes: [] }],
      documentYear: null,
    });
    const subject = parsed.subjects[0];
    expect(subject?.date).toBeUndefined();
    expect(subject?.format).toBeUndefined();
    expect(subject?.durationMinutes).toBeUndefined();
    expect(parsed.documentYear).toBeUndefined();
  });

  it("tidies whitespace in the school's wording", () => {
    const parsed = NoticeExtractionSchema.parse({
      subjects: [{ subject: "  Mathematics ", topics: [{ schoolLabel: "Bar   Graphs\n", confident: false }], notes: [] }],
    });
    expect(parsed.subjects[0]?.subject).toBe("Mathematics");
    expect(parsed.subjects[0]?.topics[0]?.schoolLabel).toBe("Bar Graphs");
  });

  it.each([
    ["an impossible date", { ...maths, date: "2026-02-30" }],
    ["a date without the year", { ...maths, date: "27 Oct" }],
    ["a time that is not 24-hour HH:MM", { ...maths, startTime: "8am" }],
    ["a zero-minute paper", { ...maths, durationMinutes: 0 }],
    ["an unknown assessment type", { ...maths, assessmentType: "prelim" }],
    ["an unknown question kind", { ...maths, format: { sections: [{ ...maths.format.sections[0], kind: "essay" }] } }],
    ["a part with no questions", { ...maths, format: { sections: [{ ...maths.format.sections[0], questionCount: 0 }] } }],
    ["a topic without the confident flag", { ...maths, topics: [{ schoolLabel: "Fractions" }] }],
    ["no notes list", { ...maths, notes: undefined }],
  ])("rejects %s", (_name, subject) => {
    expect(NoticeExtractionSchema.safeParse({ subjects: [subject] }).success).toBe(false);
  });

  it("can be turned into a JSON schema for structured output", () => {
    const format = zodOutputFormat(NoticeExtractionModelSchema);
    expect(format.type).toBe("json_schema");
    expect(JSON.stringify(format.schema)).toContain("schoolLabel");
    expect(zodOutputFormat(TopicMappingModelSchema).type).toBe("json_schema");
  });

  it("keeps the provider-facing shape in step with the strict one", () => {
    const answer = { subjects: [maths], documentYear: 2026 };
    // Whatever passes the strict schema also passes the provider-facing one, so the model is never asked for less.
    expect(NoticeExtractionSchema.safeParse(answer).success).toBe(true);
    expect(NoticeExtractionModelSchema.safeParse(answer).success).toBe(true);
    const keys = (schema: { shape: Record<string, unknown> }) => Object.keys(schema.shape).sort();
    expect(keys(NoticeExtractionModelSchema)).toEqual(keys(NoticeExtractionSchema));
    const subjectShape = (schema: typeof NoticeExtractionSchema) => (schema.shape.subjects.element as unknown as { shape: Record<string, unknown> });
    expect(keys(subjectShape(NoticeExtractionModelSchema as unknown as typeof NoticeExtractionSchema))).toEqual(keys(subjectShape(NoticeExtractionSchema)));
  });
});

describe("TopicMappingSchema", () => {
  it("allows at most two codes per wording", () => {
    expect(TopicMappingSchema.safeParse({ mappings: [{ schoolLabel: "Shapes", topicCodes: ["A", "B"] }] }).success).toBe(true);
    expect(TopicMappingSchema.safeParse({ mappings: [{ schoolLabel: "Shapes", topicCodes: ["A", "B", "C"] }] }).success).toBe(false);
  });
});
