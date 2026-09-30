import { z } from "zod";
import { isValidIsoDate } from "@/domain/assessments/dates";

/**
 * What the model returns after reading a school notice, and the closed answer it gives when a
 * topic wording is not in our alias list (ADR-0002: every model output is checked against a
 * schema before anything uses it).
 *
 * The model reports what the notice says. It never chooses curriculum topics for the parent:
 * `schoolLabel` is the school's own wording, mapped afterwards by src/domain/assessments/notice.ts.
 * Optional keys may come back as null; they are read as "not found".
 */

export const NOTICE_ASSESSMENT_TYPES = ["end_of_year", "wa1", "wa2", "wa3", "class_test", "other"] as const;
export const NOTICE_SECTION_KINDS = ["mcq", "short", "word_problem"] as const;

const optional = <T extends z.ZodType>(schema: T) => schema.nullish().transform((value) => value ?? undefined);

const text = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(max));

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "must be YYYY-MM-DD" })
  .refine(isValidIsoDate, { error: "must be a real calendar day" });

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "must be HH:MM (24 hour)" });

export const NoticeTopicSchema = z.object({
  /** The school's own words for the topic, as printed on the notice. */
  schoolLabel: text(160),
  /** False when the wording was hard to read or the item looked like it might not be a topic. */
  confident: z.boolean(),
});

export const NoticeSectionSchema = z.object({
  /** The school's name for the part, e.g. "Section A" or "Booklet B". */
  label: text(30),
  booklet: optional(text(30)),
  kind: z.enum(NOTICE_SECTION_KINDS),
  /** The school's words for the question type, e.g. "Open-ended questions". Used to check `kind`. */
  wording: optional(text(80)),
  questionCount: z.number().int().min(1).max(40),
  totalMarks: z.number().int().min(1).max(100),
  confident: z.boolean(),
});

export const NoticeFormatSchema = z.object({
  sections: z.array(NoticeSectionSchema).min(1).max(8),
  totalMarks: optional(z.number().int().min(1).max(200)),
});

export const NoticeSubjectSchema = z.object({
  subject: text(60),
  assessmentName: optional(text(60)),
  assessmentType: optional(z.enum(NOTICE_ASSESSMENT_TYPES)),
  date: optional(IsoDateSchema),
  startTime: optional(TimeSchema),
  durationMinutes: optional(z.number().int().min(5).max(600)),
  topics: z.array(NoticeTopicSchema).max(60),
  format: optional(NoticeFormatSchema),
  /** Rules and reminders for the paper, e.g. "Protractors are not allowed". */
  notes: z.array(text(200)).max(20),
});

export const NoticeExtractionSchema = z.object({
  subjects: z.array(NoticeSubjectSchema).max(12),
  documentYear: optional(z.number().int().min(2020).max(2100)),
});

/**
 * The same shape as `NoticeExtractionSchema`, written without transforms so it can be turned into the
 * JSON schema a provider is asked to follow. The strict schema above is what every answer is
 * checked against afterwards; a test keeps the two in step.
 */
export const NoticeExtractionModelSchema = z.object({
  subjects: z.array(
    z.object({
      subject: z.string(),
      assessmentName: z.string().nullish(),
      assessmentType: z.enum(NOTICE_ASSESSMENT_TYPES).nullish(),
      date: z.string().nullish().describe("YYYY-MM-DD"),
      startTime: z.string().nullish().describe("24-hour HH:MM"),
      durationMinutes: z.number().int().nullish(),
      topics: z.array(z.object({ schoolLabel: z.string(), confident: z.boolean() })),
      format: z
        .object({
          sections: z.array(
            z.object({
              label: z.string(),
              booklet: z.string().nullish(),
              kind: z.enum(NOTICE_SECTION_KINDS),
              wording: z.string().nullish(),
              questionCount: z.number().int(),
              totalMarks: z.number().int(),
              confident: z.boolean(),
            }),
          ),
          totalMarks: z.number().int().nullish(),
        })
        .nullish(),
      notes: z.array(z.string()),
    }),
  ),
  documentYear: z.number().int().nullish(),
});

export const TopicMappingModelSchema = z.object({
  mappings: z.array(z.object({ schoolLabel: z.string(), topicCodes: z.array(z.string()) })),
});

export type NoticeTopic = z.infer<typeof NoticeTopicSchema>;
export type NoticeSection = z.infer<typeof NoticeSectionSchema>;
export type NoticeSubject = z.infer<typeof NoticeSubjectSchema>;
export type NoticeExtraction = z.infer<typeof NoticeExtractionSchema>;

/** The model's answer for topic wordings the alias list does not know. Codes come from a closed list. */
export const TopicMappingSchema = z.object({
  mappings: z
    .array(
      z.object({
        schoolLabel: text(160),
        /** Zero, one or two topic codes from the list given in the request. Empty when nothing fits. */
        topicCodes: z.array(z.string().min(1).max(40)).max(2),
      }),
    )
    .max(60),
});

export type TopicMapping = z.infer<typeof TopicMappingSchema>;

/** The topic-alias file under content/curriculum: school wording to a curriculum topic code. */
export const TopicAliasTableSchema = z.object({
  version: z.number().int().min(1),
  note: z.string().optional(),
  aliases: z
    .array(
      z.union([
        z.object({ label: z.string().min(1), topic: z.string().min(1) }).strict(),
        z.object({ label: z.string().min(1), appliesAcross: z.literal(true) }).strict(),
      ]),
    )
    .min(1),
});

export type TopicAliasTable = z.infer<typeof TopicAliasTableSchema>;
