export type QuestionErrorCode =
  | "invalid_draft"
  | "unknown_outcome"
  | "curriculum_unavailable"
  | "not_found"
  | "invalid_transition"
  | "review_blocked"
  | "not_editable";

/**
 * A question-bank rule was broken. `message` is plain language an admin can act on and
 * `issues` lists every problem found (each with the field it belongs to), so a form can show
 * them next to the fields.
 */
export class QuestionError extends Error {
  readonly code: QuestionErrorCode;
  readonly issues: readonly string[];

  constructor(code: QuestionErrorCode, message: string, issues: readonly string[] = []) {
    super(message);
    this.name = "QuestionError";
    this.code = code;
    this.issues = issues;
  }
}
