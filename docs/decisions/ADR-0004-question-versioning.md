# ADR-0004: Version Questions and Freeze Papers

## Status
Accepted

## Context
Questions may be corrected or improved after papers have already been generated or attempted.

## Decision
A question family has multiple immutable question versions. Generated papers reference exact question-version IDs. A published/used question is never edited in place.

## Consequences
- historical papers remain reproducible;
- corrections produce a new version;
- analytics can identify faulty versions precisely.
