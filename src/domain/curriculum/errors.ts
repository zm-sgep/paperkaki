export type ImportIssue = {
  /** JSON path such as `domains[0].topics[2].outcomes[1].code`. Empty for the whole file. */
  path: string;
  message: string;
};

export function formatImportIssue(issue: ImportIssue): string {
  return issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`;
}

/** The import file is not valid. `issues` lists every problem found, each with its JSON path. */
export class CurriculumImportError extends Error {
  readonly issues: readonly ImportIssue[];

  constructor(issues: readonly ImportIssue[], summary = "The curriculum file is not valid") {
    super([`${summary}:`, ...issues.map((issue) => `  - ${formatImportIssue(issue)}`)].join("\n"));
    this.name = "CurriculumImportError";
    this.issues = issues;
  }
}

/** A published or retired version is a historical record and cannot be changed (ADR-0003). */
export class CurriculumVersionLockedError extends Error {
  constructor(versionCode: string, status: string) {
    super(
      `Curriculum version ${versionCode} is ${status} and cannot be changed. Import the changes as a new version instead (ADR-0003).`,
    );
    this.name = "CurriculumVersionLockedError";
  }
}

export class CurriculumNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} was not found.`);
    this.name = "CurriculumNotFoundError";
  }
}

export type PublishRefusalReason =
  | "no_outcomes"
  | "outcomes_without_source"
  | "unverified_outcomes"
  | "unverified_in_production";

/** Publishing was refused. `codes` names the outcomes involved (capped for readability). */
export class CurriculumPublishRefusedError extends Error {
  readonly reason: PublishRefusalReason;
  readonly count: number;
  readonly codes: readonly string[];

  constructor(reason: PublishRefusalReason, message: string, count: number, codes: readonly string[] = []) {
    super(message);
    this.name = "CurriculumPublishRefusedError";
    this.reason = reason;
    this.count = count;
    this.codes = codes;
  }
}

/** Provenance rules broken, for example marking an outcome verified without a page reference. */
export class CurriculumProvenanceError extends Error {
  readonly reason: "missing_verifier" | "no_source_link" | "no_page_reference";

  constructor(reason: CurriculumProvenanceError["reason"], message: string) {
    super(message);
    this.name = "CurriculumProvenanceError";
    this.reason = reason;
  }
}
