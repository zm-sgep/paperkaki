/**
 * Provenance rules (M1-03, ADR-0012). Curriculum facts need a source; "verified" means a
 * named person checked the outcome against a specific page or section of that source.
 */

export type OutcomeEvidence = { pageOrSection: string | null };

export type VerificationCheck =
  | { ok: true }
  | { ok: false; reason: "missing_verifier" | "no_source_link" | "no_page_reference"; message: string };

export function hasPageReference(link: OutcomeEvidence): boolean {
  return (link.pageOrSection ?? "").trim().length > 0;
}

/**
 * An outcome can be marked verified only by a named verifier, and only when at least one
 * source link carries a page or section, so the check can be repeated by the next person.
 */
export function checkCanMarkVerified(input: {
  verifierProfileId: string | null | undefined;
  links: readonly OutcomeEvidence[];
}): VerificationCheck {
  if (!input.verifierProfileId) {
    return { ok: false, reason: "missing_verifier", message: "A named person must mark an outcome as verified." };
  }
  if (input.links.length === 0) {
    return { ok: false, reason: "no_source_link", message: "Link the outcome to a source before marking it verified." };
  }
  if (!input.links.some(hasPageReference)) {
    return {
      ok: false,
      reason: "no_page_reference",
      message: "Add the page or section in the source before marking the outcome verified.",
    };
  }
  return { ok: true };
}
