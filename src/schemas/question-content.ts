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

// ---------------------------------------------------------------------------
// Diagram blocks: structured data drawn by deterministic renderers, never
// images and never free-form. Each block validates that what it describes can
// actually be drawn (bars within scale, cells on the grid, and so on).
// ---------------------------------------------------------------------------

const IntCoordSchema = z.number().int();

/** Longest bar/axis label; keeps category labels legible in a fixed layout. */
export const BAR_LABEL_MAX_LENGTH = 16;
/** The bar-graph value axis draws one gridline per step; more than this is unreadable. */
export const BAR_GRAPH_MAX_STEPS = 12;
/** A grid must fit beside the question number and marks columns of an A4 paper. */
export const GRID_MAX_WIDTH_MM = 130;

export const BarGraphBlockSchema = z
  .object({
    t: z.literal("bargraph"),
    title: z.string().min(1),
    categoryAxisLabel: z.string().min(1),
    valueAxisLabel: z.string().min(1),
    scale: z
      .object({ max: z.number().int().min(2), step: z.number().int().min(1) })
      .strict(),
    bars: z
      .array(
        z
          .object({
            label: z.string().min(1).max(BAR_LABEL_MAX_LENGTH),
            value: z.number().int().min(0),
          })
          .strict(),
      )
      .min(2)
      .max(6),
    orientation: z.enum(["vertical", "horizontal"]),
  })
  .strict()
  .superRefine((g, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const { max, step } = g.scale;
    if (step > max) issue("Scale step must not exceed the scale max", ["scale", "step"]);
    else if (max % step !== 0) issue("Scale max must be a whole number of steps", ["scale", "max"]);
    else if (max / step > BAR_GRAPH_MAX_STEPS) {
      issue(`Scale must have at most ${BAR_GRAPH_MAX_STEPS} steps`, ["scale", "step"]);
    }
    const seen = new Set<string>();
    g.bars.forEach((bar, i) => {
      if (bar.value > max) issue(`Bar value ${bar.value} exceeds the scale max ${max}`, ["bars", i, "value"]);
      if (seen.has(bar.label)) issue(`Duplicate bar label "${bar.label}"`, ["bars", i, "label"]);
      seen.add(bar.label);
    });
  });

const GridCellSchema = z.tuple([IntCoordSchema.min(0), IntCoordSchema.min(0)]);
const GridPointSchema = z.tuple([IntCoordSchema.min(0), IntCoordSchema.min(0)]);

export const GridBlockSchema = z
  .object({
    t: z.literal("grid"),
    cols: z.number().int().min(2).max(14),
    rows: z.number().int().min(2).max(10),
    cellMm: z.number().min(5).max(10),
    /** Unit squares to shade, as [col, row] with [0, 0] the top-left square. */
    shaded: z.array(GridCellSchema).min(1).optional(),
    /** Closed rectilinear polygon along grid lines, as [x, y] vertices with [0, 0] the top-left corner. */
    outline: z.array(GridPointSchema).min(4).optional(),
  })
  .strict()
  .superRefine((g, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (g.shaded === undefined && g.outline === undefined) {
      issue("A grid needs shaded squares, an outline, or both", ["shaded"]);
    }
    if (g.cols * g.cellMm > GRID_MAX_WIDTH_MM) {
      issue(`Grid is wider than ${GRID_MAX_WIDTH_MM} mm`, ["cols"]);
    }
    const seen = new Set<string>();
    g.shaded?.forEach(([col, row], i) => {
      if (col >= g.cols || row >= g.rows) issue(`Shaded square [${col}, ${row}] is outside the grid`, ["shaded", i]);
      const key = `${col},${row}`;
      if (seen.has(key)) issue(`Shaded square [${col}, ${row}] is listed twice`, ["shaded", i]);
      seen.add(key);
    });
    const outline = g.outline;
    if (outline) {
      outline.forEach(([x, y], i) => {
        if (x > g.cols || y > g.rows) issue(`Outline point [${x}, ${y}] is outside the grid`, ["outline", i]);
      });
      outline.forEach(([x, y], i) => {
        const [nx, ny] = outline[(i + 1) % outline.length] as [number, number];
        if (x === nx && y === ny) issue("Outline has a zero-length side", ["outline", i]);
        else if (x !== nx && y !== ny) issue("Outline sides must be horizontal or vertical", ["outline", i]);
      });
    }
  });

export const AngleBlockSchema = z
  .object({
    t: z.literal("angle"),
    degrees: z.number().int().min(20).max(170),
    armLengthMm: z.number().min(15).max(45),
    label: z.string().min(1).max(4).optional(),
    showRightAngleMark: z.boolean().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.showRightAngleMark === true && a.degrees !== 90) {
      ctx.addIssue({
        code: "custom",
        message: "The right-angle mark can only be shown on a 90 degree angle",
        path: ["showRightAngleMark"],
      });
    }
  });

const LineCoordSchema = z.tuple([IntCoordSchema.min(0).max(12), IntCoordSchema.min(0).max(12)]);

export const LinesBlockSchema = z
  .object({
    t: z.literal("lines"),
    segments: z
      .array(
        z
          .object({
            from: LineCoordSchema,
            to: LineCoordSchema,
            label: z.string().min(1).max(4).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    points: z
      .array(z.object({ at: LineCoordSchema, label: z.string().min(1).max(4) }).strict())
      .max(8)
      .optional(),
    /** Dots at every integer coordinate from [0, 0] to [cols - 1, rows - 1], for the child to draw on. */
    dotGrid: z
      .object({ cols: z.number().int().min(2).max(13), rows: z.number().int().min(2).max(13) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((l, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });
    l.segments.forEach((s, i) => {
      if (s.from[0] === s.to[0] && s.from[1] === s.to[1]) issue("A segment must have two different ends", ["segments", i]);
    });
    const dots = l.dotGrid;
    if (dots) {
      const inside = ([x, y]: readonly [number, number]) => x < dots.cols && y < dots.rows;
      l.segments.forEach((s, i) => {
        if (!inside(s.from) || !inside(s.to)) issue("Segment ends must lie on the dot grid", ["segments", i]);
      });
      l.points?.forEach((p, i) => {
        if (!inside(p.at)) issue("Point must lie on the dot grid", ["points", i]);
      });
    }
  });

export const BlockSchema = z.discriminatedUnion("t", [
  ParagraphBlockSchema,
  TableBlockSchema,
  ImageBlockSchema,
  BarGraphBlockSchema,
  GridBlockSchema,
  AngleBlockSchema,
  LinesBlockSchema,
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
