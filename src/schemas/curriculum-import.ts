import { z } from "zod";

/**
 * The curriculum import format (M1-04): one JSON file describes one curriculum version, the
 * sources it cites, and its domains -> topics -> outcomes. Files live under content/curriculum/.
 *
 * Every object is strict so a misspelt key is reported instead of silently ignored.
 * Cross-record rules (duplicate codes, unknown source ids, levels) are checked by
 * `validateCurriculumImport` in src/domain/curriculum/import-validation.ts.
 */

export const LEVEL_PATTERN = /^P[1-6]$/;
export const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const code = () =>
  z
    .string()
    .regex(CODE_PATTERN, { error: "must be a code of letters, digits, '.', '_' or '-' (for example P3-NA-FR-02)" });
const text = () => z.string().trim().min(1, { error: "must not be empty" });
const level = () =>
  z.string().regex(LEVEL_PATTERN, { error: 'must be a level from "P1" to "P6"' });

export const ImportProvenanceSchema = z.enum(
  ["official_moe", "official_seab", "official_school", "parent_provided", "historical_observation", "system_inference"],
  { error: "must be one of: official_moe, official_seab, official_school, parent_provided, historical_observation, system_inference" },
);

export const ImportSourceRefSchema = z
  .object({
    sourceId: text(),
    /** Page or section in the source. Needed before a person can mark the outcome verified. */
    pageOrSection: text().optional(),
  })
  .strict();

export const ImportOutcomeSchema = z
  .object({
    code: code(),
    /** The source's own wording. */
    statement: text(),
    /** The wording a child sees. */
    childLabel: text(),
    level: level().optional(),
    /**
     * Files can only say "unverified". Verification is done by a named person in the admin
     * curriculum browser, never asserted by a file.
     */
    verification: z
      .literal("unverified", {
        error:
          'must be "unverified": a person marks an outcome verified in the admin curriculum browser, an import file cannot',
      })
      .optional(),
    sourceRef: ImportSourceRefSchema.optional(),
    sourceRefs: z.array(ImportSourceRefSchema).min(1).optional(),
  })
  .strict()
  .superRefine((outcome, context) => {
    if (!outcome.sourceRef && !outcome.sourceRefs) {
      context.addIssue({
        code: "custom",
        path: ["sourceRef"],
        message: "missing source: every outcome needs a sourceRef (or sourceRefs) naming where it comes from",
      });
    }
    if (outcome.sourceRef && outcome.sourceRefs) {
      context.addIssue({
        code: "custom",
        path: ["sourceRefs"],
        message: "use either sourceRef or sourceRefs, not both",
      });
    }
  });

export const ImportTopicSchema = z
  .object({
    code: code(),
    title: text(),
    /** The wording a parent sees. */
    parentLabel: text(),
    level: level().optional(),
    sortOrder: z.number().int().min(0).optional(),
    /** Quoted source wording that limits the scope of the topic. */
    notes: z.array(text()).optional(),
    outcomes: z.array(ImportOutcomeSchema).min(1, { error: "a topic needs at least one outcome" }),
  })
  .strict();

export const ImportDomainSchema = z
  .object({
    code: code(),
    title: text(),
    sortOrder: z.number().int().min(0).optional(),
    topics: z.array(ImportTopicSchema).min(1, { error: "a domain needs at least one topic" }),
  })
  .strict();

export const ImportSourceSchema = z
  .object({
    id: text(),
    title: text(),
    publisher: text(),
    url: z.url({ error: "must be an absolute URL" }).optional(),
    provenance: ImportProvenanceSchema,
    accessed: z.iso.date({ error: "must be a date like 2026-09-29" }).optional(),
    verification: z.enum(["unverified", "verified"], { error: "must be unverified or verified" }),
    notes: text().optional(),
  })
  .strict();

export const ImportVersionSchema = z
  .object({
    code: code(),
    subject: text(),
    title: text(),
    levels: z.array(level()).min(1, { error: "needs at least one level" }),
    effectiveFrom: z.iso.date({ error: "must be a date like 2025-10-01" }).optional(),
    /** An import never publishes. Publishing is a separate, checked command. */
    status: z.literal("draft", { error: 'must be "draft": publishing is a separate step' }).optional(),
  })
  .strict();

export const ImportRelationshipSchema = z
  .object({
    from: code(),
    to: code(),
    kind: z.enum(["prerequisite", "progression"], { error: "must be prerequisite or progression" }),
  })
  .strict();

export const CurriculumImportSchema = z
  .object({
    curriculumVersion: ImportVersionSchema,
    sources: z.array(ImportSourceSchema).min(1, { error: "needs at least one source" }),
    domains: z.array(ImportDomainSchema).min(1, { error: "needs at least one domain" }),
    relationships: z.array(ImportRelationshipSchema).optional(),
  })
  .strict();

export type CurriculumImportFile = z.infer<typeof CurriculumImportSchema>;
