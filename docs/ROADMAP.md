# Engineering Roadmap

## Milestone 0 — Foundation

Goal: reliable repository, environments and delivery pipeline.

Deliver:
- app scaffold;
- auth;
- Postgres;
- storage abstraction;
- CI;
- test harness;
- logging/error handling;
- admin role foundation.

Exit:
A parent can sign in and reach a protected dashboard; CI is green.

## Milestone 1 — P3 Maths Curriculum

Goal: source-backed curriculum model.

Deliver:
- curriculum schema;
- source/provenance;
- P3 Maths import/seed workflow;
- admin curriculum browser;
- curriculum API;
- validation tests.

Exit:
Every P3 Maths outcome in the application is traceable to a source and can be selected by ID.

## Milestone 2 — Question Bank

Goal: curated and reviewable assessment items.

Deliver:
- question families;
- versioned questions;
- outcome mapping;
- answer/solution model;
- admin create/edit/review;
- approval workflow;
- filters;
- fixtures/tests.

Exit:
At least one P3 Maths topic has enough approved questions to generate several distinct papers.

## Milestone 3 — Assessment Builder

Goal: create a valid blueprint from parent-confirmed scope.

Deliver:
- child profile;
- assessment;
- manual scope selection;
- requirements;
- blueprint generation;
- blueprint validation;
- question-selection service preview.

Exit:
A parent can configure a P3 Maths assessment and produce a validated blueprint.

## Milestone 4 — Printable Mock

Goal: turn a blueprint into a frozen paper and PDFs.

Deliver:
- deterministic question selector;
- paper versioning;
- structural validator;
- student PDF;
- answer/solution pack;
- generation history;
- E2E flow.

Exit:
`Create child -> create assessment -> select scope -> build blueprint -> generate printable mock + answer pack` works end to end.

## Milestone 5 — School Scope Upload

Later:
- image/PDF upload;
- text extraction;
- structured scope extraction;
- curriculum mapping;
- parent confirmation.

## Milestone 6 — Deterministic Digital Marking

Later.

## Milestone 7 — Scan and Mark

Later.

## Milestone 8 — Mastery

Later.

## Milestone 9 — Targeted Practice

Later.

## Milestone 10 — Adaptive Mock

Later.

## Expansion

Only after the complete P3 Maths loop reaches quality thresholds:

P4 Maths -> P5 Maths -> P6 Maths -> P3–P6 Science -> English -> Chinese.


## Cross-cutting UX Foundation — before/through M0–M4

UX simplicity is not a later polish milestone. Implement these constraints while building the first vertical slice:
- four parent destinations and four child destinations;
- state-driven Home/Today;
- recommended defaults;
- contextual guidance only;
- dedicated Mock Mode layout;
- responsive tab/sidebar adaptation;
- usability instrumentation;
- task-based usability testing before broad beta.

## Milestone 5 — School Notice Extraction
- upload/photo/PDF;
- structured extraction;
- parent confirmation;
- uncertain fields highlighted without raw model internals.

## Milestone 6 — Attempt & Deterministic Marking
- iPad and print-upload attempt models;
- deterministic answer marking where supported.

## Milestone 7 — AI-Assisted Marking
- handwriting/working interpretation;
- confidence-aware review;
- marked-paper UX.

## Milestone 8 — Mastery
- evidence model;
- topic/outcome mastery;
- readiness semantics.

## Milestone 9 — Targeted Practice
- recommended practice;
- mistake review;
- similar questions.

## Milestone 10 — Adaptive Mock
- representative scope maintained;
- weak-area weighting;
- retention coverage.

## Milestone 11 — Mastery-Based Gamification & Parent Rewards
- versioned reward policy;
- deterministic RewardEngine;
- anti-farming;
- append-only ledger;
- child points UX;
- parent reward catalogue;
- redemption approval.
