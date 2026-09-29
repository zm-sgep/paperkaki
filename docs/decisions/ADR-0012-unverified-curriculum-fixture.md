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
