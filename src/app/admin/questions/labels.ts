/** Admin-only wording for the question bank. */

export const TYPE_LABEL = {
  mcq: "Multiple choice",
  number: "Number answer",
  fraction: "Fraction answer",
  text: "Written answer",
} as const;

export const DIFFICULTY_LABEL = { basic: "Basic", standard: "Standard", challenging: "Challenging" } as const;

export const DEMAND_LABEL = { recall: "Recall", application: "Application", reasoning: "Reasoning" } as const;

export const PROVENANCE_LABEL = {
  original_human: "Written by a person",
  original_ai: "Written with AI, checked by a person",
  licensed: "Licensed",
  public_domain: "Public domain",
  organisation_owned: "Owned by the organisation",
} as const;

export const ACTION_LABEL: Record<string, string> = {
  "question.created": "Draft created",
  "question.edited": "Draft edited",
  "question.revised": "New version created from an approved question",
  "question.submitted": "Sent for review",
  "question.approved": "Approved",
  "question.changes_requested": "Changes requested",
  "question.retired": "Retired",
};

export function formatDateTime(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
