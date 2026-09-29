# ADR-0003: Immutable Curriculum Versions

## Status
Accepted

## Context
MOE/SEAB curriculum and assessment formats change over time. Historical papers and cohorts must be interpreted against the applicable version.

## Decision
Curriculum versions are immutable once published. Outcomes link to a specific curriculum version and retain source provenance/effective dates.

## Alternatives
- Keep one current curriculum table and overwrite changes.
- Store syllabus text only in JSON.

## Consequences
Pros:
- historical correctness;
- auditability;
- safer school/cohort mapping.

Cons:
- more records and explicit version selection.

## Rule
Never silently remap an old paper to a newer curriculum version.
