import { z } from "zod";

/**
 * Structured question content, answer and draft schemas (M2-02).
 *
 * Content is data, never HTML or LaTeX: renderers (PDF, web) walk these
 * structures. Fractions have one canonical representation (`frac`).
 */

// ---------------------------------------------------------------------------
// Inline and block content
// ---------------------------------------------------------------------------

export const TextInlineSchema = z.object({ t: z.literal("text"), v: z.string().min(1) }).strict();

export const FractionInlineSchema = z
  .object({
    t: z.literal("frac"),
    n: z.number().int().min(0),
    d: z.number().int().min(1),
    whole: z.number().int().min(1).optional(),
  })
  .strict();

export const BlankInlineSchema = z
  .object({ t: z.literal("blank"), label: z.string().optional() })
  .strict();

export const InlineSchema = z.discriminatedUnion("t", [
  TextInlineSchema,
  FractionInlineSchema,
  BlankInlineSchema,
]);
export type Inline = z.infer<typeof InlineSchema>;

const InlineListSchema = z.array(InlineSchema).min(1);

export const ParagraphBlockSchema = z.object({ t: z.literal("p"), c: InlineListSchema }).strict();

export const TableBlockSchema = z
  .object({
    t: z.literal("table"),
    header: z.boolean(),
    rows: z.array(z.array(z.array(InlineSchema))).min(1),
  })
  .strict()
  .superRefine((table, ctx) => {
    const width = table.rows[0]?.length ?? 0;
    if (width === 0) {
      ctx.addIssue({ code: "custom", message: "Table rows must have at least one cell", path: ["rows"] });
      return;
    }
    table.rows.forEach((row, i) => {
      if (row.length !== width) {
        ctx.addIssue({
          code: "custom",
          message: `Table must be rectangular: row ${i} has ${row.length} cells, expected ${width}`,
          path: ["rows", i],
        });
      }
    });
  });

export const ImageBlockSchema = z
  .object({
    t: z.literal("image"),
    assetKey: z.string().min(1),
    alt: z.string(),
    widthMm: z.number().min(10).max(170).optional(),
  })
  .strict();

export const BlockSchema = z.discriminatedUnion("t", [
  ParagraphBlockSchema,
  TableBlockSchema,
  ImageBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;

export const OptionIdSchema = z.enum(["A", "B", "C", "D"]);
export type OptionId = z.infer<typeof OptionIdSchema>;

export const QuestionContentSchema = z
  .object({
    stem: z.array(BlockSchema).min(1),
    options: z.array(z.object({ id: OptionIdSchema, c: InlineListSchema }).strict()).optional(),
  })
  .strict();
export type QuestionContent = z.infer<typeof QuestionContentSchema>;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export const UnitSchema = z.enum(["cm", "m", "km", "g", "kg", "ml", "l", "$", "min", "h"]);
export type Unit = z.infer<typeof UnitSchema>;

/** Integer or exact decimal: "1250", "12.50", "-3". */
export const NUMBER_VALUE_PATTERN = /^-?\d+(\.\d+)?$/;
/** Proper/improper fraction or mixed number: "3/4", "1 1/2". */
export const FRACTION_VALUE_PATTERN = /^(\d+ )?\d+\/[1-9]\d*$/;

export const McqAnswerSchema = z.object({ kind: z.literal("mcq"), correct: OptionIdSchema }).strict();

export const NumberAnswerSchema = z
  .object({
    kind: z.literal("number"),
    value: z.string().regex(NUMBER_VALUE_PATTERN, "Expected an integer or exact decimal"),
    unit: UnitSchema.optional(),
    display: z.array(InlineSchema).optional(),
  })
  .strict();

export const FractionAnswerSchema = z
  .object({
    kind: z.literal("fraction"),
    value: z.string().regex(FRACTION_VALUE_PATTERN, 'Expected a fraction like "3/4" or "1 1/2"'),
    acceptEquivalent: z.boolean(),
    requireSimplest: z.boolean(),
  })
  .strict();

export const TextAnswerSchema = z
  .object({ kind: z.literal("text"), accepted: z.array(z.string().min(1)).min(1) })
  .strict();

export const AnswerSchema = z.discriminatedUnion("kind", [
  McqAnswerSchema,
  NumberAnswerSchema,
  FractionAnswerSchema,
  TextAnswerSchema,
]);
export type Answer = z.infer<typeof AnswerSchema>;

// ---------------------------------------------------------------------------
// Verification, solution, marking
// ---------------------------------------------------------------------------

export const VerificationSchema = z.union([
  z.object({ expression: z.string().min(1) }).strict(),
  z.object({ human: z.literal(true) }).strict(),
]);
export type Verification = z.infer<typeof VerificationSchema>;

export const WorkedSolutionSchema = z.array(BlockSchema).min(1);
export type WorkedSolution = z.infer<typeof WorkedSolutionSchema>;

export const MarkingSchemeSchema = z
  .object({
    method: z.enum(["exact", "exact_with_unit"]),
    partialMarks: z
      .array(z.object({ marks: z.number().int().min(1), criterion: z.string().min(1) }).strict())
      .optional(),
  })
  .strict();
export type MarkingScheme = z.infer<typeof MarkingSchemeSchema>;

export const QuestionTypeSchema = z.enum(["mcq", "number", "fraction", "text"]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export const DifficultySchema = z.enum(["basic", "standard", "challenging"]);
export type Difficulty = z.infer<typeof DifficultySchema>;
export const CognitiveDemandSchema = z.enum(["recall", "application", "reasoning"]);
export type CognitiveDemand = z.infer<typeof CognitiveDemandSchema>;
export const ProvenanceSchema = z.enum([
  "original_human",
  "original_ai",
  "licensed",
  "public_domain",
  "organisation_owned",
]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ---------------------------------------------------------------------------
// Question draft
// ---------------------------------------------------------------------------

export const QuestionDraftSchema = z
  .object({
    familyCode: z.string().min(1),
    familyTitle: z.string().min(1),
    primaryOutcomeCode: z.string().min(1),
    secondaryOutcomeCodes: z.array(z.string().min(1)),
    questionType: QuestionTypeSchema,
    difficulty: DifficultySchema,
    cognitiveDemand: CognitiveDemandSchema,
    marks: z.number().int().min(1).max(5),
    estimatedSeconds: z.number().int().min(15).max(900),
    content: QuestionContentSchema,
    answer: AnswerSchema,
    verification: VerificationSchema,
    workedSolution: WorkedSolutionSchema,
    markingScheme: MarkingSchemeSchema,
    provenance: ProvenanceSchema,
  })
  .strict()
  .superRefine((q, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });

    if (q.answer.kind !== q.questionType) {
      issue(
        `Answer kind "${q.answer.kind}" does not match questionType "${q.questionType}"`,
        ["answer", "kind"],
      );
    }

    if (q.questionType === "mcq") {
      const ids = (q.content.options ?? []).map((o) => o.id);
      if (ids.length !== 4 || ids.join("") !== "ABCD") {
        issue("MCQ must have exactly four options with ids A, B, C, D in order", ["content", "options"]);
      }
    } else if (q.content.options !== undefined) {
      issue("Only MCQ questions may have options", ["content", "options"]);
    }

    // MCQ may be verified by expression or by a human; number/fraction must be machine-verifiable.
    if ((q.answer.kind === "number" || q.answer.kind === "fraction") && !("expression" in q.verification)) {
      issue(`${q.answer.kind} answers require verification.expression`, ["verification"]);
    }
    if (q.answer.kind === "text" && !("human" in q.verification)) {
      issue("Text answers require verification { human: true }", ["verification"]);
    }
  });
export type QuestionDraft = z.infer<typeof QuestionDraftSchema>;
