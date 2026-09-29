import { z } from "zod";
import { ASSESSMENT_TYPES } from "@/domain/assessments/assessment-types";
import { PAPER_LIMITS } from "@/domain/assessments/recommend";

/** Levels a child profile can be created for. Only Primary 3 is enabled for now. */
export const ENABLED_CHILD_LEVELS = ["P3"] as const;
export const SUPPORTED_SUBJECT = "Mathematics";

export const NicknameSchema = z
  .string({ error: "Enter your child's name or nickname." })
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, { error: "Enter your child's name or nickname." })
      .max(30, { error: "Use 30 letters or fewer." }),
  );

export const SchoolNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().max(80, { error: "Use 80 letters or fewer." }))
  .transform((value) => (value === "" ? null : value));

export const CreateChildInputSchema = z.object({
  nickname: NicknameSchema,
  level: z.enum(ENABLED_CHILD_LEVELS).default("P3"),
  schoolName: SchoolNameSchema.nullish().transform((v) => v ?? null),
});
export type CreateChildInput = z.input<typeof CreateChildInputSchema>;

export const UpdateChildInputSchema = z.object({
  nickname: NicknameSchema,
  schoolName: SchoolNameSchema.nullish().transform((v) => v ?? null),
});
export type UpdateChildInput = z.input<typeof UpdateChildInputSchema>;

export const AssessmentTypeSchema = z.enum(ASSESSMENT_TYPES, { error: "Choose the assessment." });

export const PaperSettingsInputSchema = z.object({
  totalMarks: z.coerce
    .number({ error: "Choose the total marks." })
    .int({ error: "Choose the total marks." })
    .min(PAPER_LIMITS.minMarks, { error: `Choose at least ${PAPER_LIMITS.minMarks} marks.` })
    .max(PAPER_LIMITS.maxMarks, { error: `Choose ${PAPER_LIMITS.maxMarks} marks or fewer.` })
    .refine((n) => n % PAPER_LIMITS.marksStep === 0, {
      error: `Choose marks in steps of ${PAPER_LIMITS.marksStep}.`,
    }),
  durationMinutes: z.coerce
    .number({ error: "Enter the time in minutes." })
    .int({ error: "Enter whole minutes." })
    .min(PAPER_LIMITS.minMinutes, { error: `Choose at least ${PAPER_LIMITS.minMinutes} minutes.` })
    .max(PAPER_LIMITS.maxMinutes, { error: `Choose ${PAPER_LIMITS.maxMinutes} minutes or fewer.` }),
  difficulty: z.enum(["easier", "balanced", "harder"], { error: "Choose Easier, Balanced or Harder." }),
});
/** Only the difficulty, for a paper whose marks and time come from its paper format. */
export const DifficultyInputSchema = PaperSettingsInputSchema.pick({ difficulty: true });

/**
 * Raw values as they arrive from a form; the schemas above check them. Leave `totalMarks` and
 * `durationMinutes` out to change only the difficulty of a paper whose marks and time come from
 * its paper format.
 */
export type PaperSettingsInput = { totalMarks?: unknown; durationMinutes?: unknown; difficulty: unknown };

/** Turns a zod failure into { fieldName: first message }. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
