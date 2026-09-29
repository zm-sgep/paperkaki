# ADR-0012: Unverified Curriculum Data Is Development-Only

## Status
Accepted (2026-09-29)

## Context
CLAUDE.md says: never invent curriculum outcomes; curriculum facts need provenance. The official MOE syllabus could not be downloaded from the build environment (the network policy blocks moe.gov.sg). The product still needs curriculum rows to run end to end.

## Decision
- Curriculum rows carry a verification state: `unverified`, `verified`.
- A development fixture for Primary 3 Mathematics may be loaded with every outcome marked `unverified` and its source marked as needing a page reference.
- The importer refuses to publish an `unverified` outcome when `NODE_ENV=production`. Publishing needs a named human verifier and a source page or section.
- Parent-facing screens never show verification states or source details.

## Consequences
Local development and demos work. Production cannot contain unverified curriculum. Before launch, a person must check every outcome against the official syllabus and record the page reference.

## Update (2026-09-29): official source obtained
- Source: MOE "Mathematics Syllabus Primary One to Six (Implementation starting with 2021 Primary One Cohort)", updated October 2025, 50 pages, <https://www.moe.gov.sg/api/media/92bff26d-b2b4-4535-b868-b8415c744b91/2021-Primary-Mathematics-Syllabus-P1-to-P6-Updated-October-2025.pdf>, SHA-256 `e8f77fe10d768e2ad5266dfc39a8821674be7eb1c81bc545ba4b841b12ae70e1`.
- The Primary 3 curriculum is rebuilt from this document with MOE's wording and a page reference for every outcome. It replaces the earlier draft written from memory.
- Outcomes stay `unverified` until a named person checks each one against the PDF. Software extracted the text.
- Licence: the document permits reproduction "in its entirety for personal and non-commercial use only". The PDF is not committed to this repository. Before commercial launch, confirm with MOE (Curriculum Planning and Development Division) that storing and displaying outcome statements in the product is permitted.
- When MOE publishes a newer syllabus, it is imported as a new curriculum version (ADR-0003). Existing papers keep the version they were built on.
