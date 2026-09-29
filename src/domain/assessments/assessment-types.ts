/** The kinds of school assessment a parent can add, in the order they are offered. */
export const ASSESSMENT_TYPES = ["wa1", "wa2", "wa3", "end_of_year", "class_test", "other"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

/** The words on the option buttons. */
export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  wa1: "WA1",
  wa2: "WA2",
  wa3: "WA3",
  end_of_year: "End-of-year exam",
  class_test: "Class test",
  other: "Other",
};

export const MAX_ASSESSMENT_NAME_LENGTH = 40;

export type AssessmentNameCheck = { ok: true; name: string } | { ok: false; message: string };

/**
 * The stored, derived name: "WA2", "End-of-year exam" and so on, or the parent's own text for
 * "Other". Only "Other" needs the parent to type a name.
 */
export function deriveAssessmentName(type: AssessmentType, customName: string | undefined): AssessmentNameCheck {
  if (type !== "other") return { ok: true, name: ASSESSMENT_TYPE_LABEL[type] };
  const trimmed = (customName ?? "").replace(/\s+/g, " ").trim();
  if (trimmed === "") return { ok: false, message: "Type a name for this assessment, like “Topic test”." };
  if (trimmed.length > MAX_ASSESSMENT_NAME_LENGTH) {
    return { ok: false, message: `Use ${MAX_ASSESSMENT_NAME_LENGTH} letters or fewer.` };
  }
  return { ok: true, name: trimmed };
}
