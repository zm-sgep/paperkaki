import { z } from "zod";
import { CODE_PATTERN, ImportProvenanceSchema } from "./curriculum-import";

/** Admin input for registering a curriculum source document (M1-03). */
export const RegisterSourceInputSchema = z
  .object({
    code: z.string().regex(CODE_PATTERN, { error: "must be a code of letters, digits, '.', '_' or '-'" }),
    title: z.string().trim().min(1, { error: "must not be empty" }),
    publisher: z.string().trim().min(1, { error: "must not be empty" }),
    /** External reference only: the document itself is not stored. */
    url: z
      .url({ protocol: /^https?$/, error: "must be an http(s) URL" })
      .nullish()
      .transform((value) => value ?? null),
    provenance: ImportProvenanceSchema,
    accessedOn: z.iso
      .date({ error: "must be a date like 2026-09-29" })
      .nullish()
      .transform((value) => value ?? null),
    notes: z
      .string()
      .trim()
      .nullish()
      .transform((value) => (value ? value : null)),
  })
  .strict();

export type RegisterSourceInput = z.input<typeof RegisterSourceInputSchema>;
