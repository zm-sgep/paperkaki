import type { ZodError } from "zod";

export type FieldIssue = { path: string; message: string };

/** zod issues as `path: message` pairs, the path written like `content.stem[0].c[1].n`. */
export function fieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.reduce<string>(
      (acc, part) => (typeof part === "number" ? `${acc}[${part}]` : acc === "" ? String(part) : `${acc}.${String(part)}`),
      "",
    ),
    message: issue.message,
  }));
}

export function formatFieldIssues(issues: readonly FieldIssue[]): string[] {
  return issues.map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`));
}
