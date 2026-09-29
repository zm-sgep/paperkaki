import { CurriculumPublishRefusedError } from "./errors";
import type { VerificationState } from "./types";

/**
 * Publish rules (M1-05, ADR-0003, ADR-0012).
 *
 *  1. A version needs at least one outcome.
 *  2. Every outcome needs at least one source link. Never overridable.
 *  3. Unverified outcomes block publishing, unless the caller allows it AND the
 *     environment is not production. Production never contains unverified curriculum.
 */

export type PublishCandidateOutcome = {
  code: string;
  sourceLinkCount: number;
  verification: VerificationState;
};

export type PublishDecision = {
  /** Outcomes published while still unverified (development only). Zero when all are verified. */
  unverifiedCount: number;
};

const MAX_LISTED_CODES = 8;

function listCodes(codes: readonly string[]): string {
  const shown = codes.slice(0, MAX_LISTED_CODES).join(", ");
  return codes.length > MAX_LISTED_CODES ? `${shown} and ${codes.length - MAX_LISTED_CODES} more` : shown;
}

/** Returns the decision, or throws CurriculumPublishRefusedError saying why. Pure. */
export function decidePublish(input: {
  outcomes: readonly PublishCandidateOutcome[];
  allowUnverified: boolean;
  nodeEnv: string | undefined;
}): PublishDecision {
  if (input.outcomes.length === 0) {
    throw new CurriculumPublishRefusedError(
      "no_outcomes",
      "This curriculum version has no outcomes, so it cannot be published.",
      0,
    );
  }

  const unsourced = input.outcomes.filter((outcome) => outcome.sourceLinkCount === 0).map((outcome) => outcome.code);
  if (unsourced.length > 0) {
    throw new CurriculumPublishRefusedError(
      "outcomes_without_source",
      `${unsourced.length} outcome(s) have no source link and cannot be published: ${listCodes(unsourced)}.`,
      unsourced.length,
      unsourced,
    );
  }

  const unverified = input.outcomes.filter((outcome) => outcome.verification !== "verified").map((outcome) => outcome.code);
  if (unverified.length === 0) {
    return { unverifiedCount: 0 };
  }

  if (input.nodeEnv === "production") {
    throw new CurriculumPublishRefusedError(
      "unverified_in_production",
      `${unverified.length} outcome(s) are unverified. Production cannot contain unverified curriculum (ADR-0012): a named person must verify each outcome against its source page first.`,
      unverified.length,
      unverified,
    );
  }
  if (!input.allowUnverified) {
    throw new CurriculumPublishRefusedError(
      "unverified_outcomes",
      `${unverified.length} outcome(s) are unverified: ${listCodes(unverified)}. Verify them, or publish with allowUnverified in a non-production environment.`,
      unverified.length,
      unverified,
    );
  }
  return { unverifiedCount: unverified.length };
}
