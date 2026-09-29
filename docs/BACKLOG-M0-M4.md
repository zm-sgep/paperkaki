# GitHub Backlog — Milestones 0–4

Use one issue per item. IDs are planning IDs, not GitHub issue numbers.

Labels: `P0`, `P1`, `M0`...`M4`, `size:S|M|L|XL`.

## M0 Foundation

### M0-01 — Scaffold Next.js TypeScript application

**Priority:** P0  
**Size:** M  
**Dependencies:** None

Create the base web application with TypeScript, Tailwind, environment validation and project folder boundaries.

**Acceptance criteria**

- [ ] App starts locally
- [ ] TypeScript strict mode enabled
- [ ] Environment variables validated at startup
- [ ] Folder structure follows ARCHITECTURE.md
- [ ] README contains local setup instructions

---

### M0-02 — Provision PostgreSQL and migration workflow

**Priority:** P0  
**Size:** M  
**Dependencies:** M0-01

Configure PostgreSQL access, typed query layer/ORM and migration commands.

**Acceptance criteria**

- [ ] Local database can be started or connected
- [ ] Migration command creates schema deterministically
- [ ] CI can validate migrations
- [ ] No production credentials committed

---

### M0-03 — Implement managed parent authentication

**Priority:** P0  
**Size:** M  
**Dependencies:** M0-01, M0-02

Add parent sign-in/sign-out and protected routes using managed auth.

**Acceptance criteria**

- [ ] Unauthenticated user cannot access dashboard
- [ ] Authenticated user has an application parent profile
- [ ] Server-side ownership identity is available
- [ ] Auth flow covered by integration/E2E smoke test

---

### M0-04 — Create application layout and protected dashboard shell

**Priority:** P1  
**Size:** S  
**Dependencies:** M0-03

Create mobile-first parent dashboard shell and navigation.

**Acceptance criteria**

- [ ] Dashboard renders on phone and desktop
- [ ] Loading/error/empty states exist
- [ ] No domain business logic in UI components

---

### M0-05 — Add private object storage abstraction

**Priority:** P1  
**Size:** M  
**Dependencies:** M0-01, M0-03

Create StorageService interface and private bucket configuration for generated PDFs/assets.

**Acceptance criteria**

- [ ] Objects are private by default
- [ ] Signed URL helper checks ownership or admin access
- [ ] Storage keys, not public URLs, are stored
- [ ] Unit tests cover adapter contract

---

### M0-06 — Set up CI quality gates

**Priority:** P0  
**Size:** M  
**Dependencies:** M0-01, M0-02

Add CI for typecheck, lint, unit/integration tests and build.

**Acceptance criteria**

- [ ] PR workflow runs required checks
- [ ] Failure blocks merge
- [ ] Commands documented locally
- [ ] CI does not require production secrets

---

### M0-07 — Set up test harness and factories

**Priority:** P0  
**Size:** M  
**Dependencies:** M0-01, M0-02, M0-03

Configure unit, integration and E2E foundations plus deterministic test data factories.

**Acceptance criteria**

- [ ] Unit test command works
- [ ] Integration DB tests run in isolation
- [ ] E2E smoke test can run
- [ ] All test child data is fictional

---

### M0-08 — Add structured logging, error boundaries and audit helper

**Priority:** P1  
**Size:** M  
**Dependencies:** M0-01, M0-02

Provide structured server logs, safe user errors and audit-event helper.

**Acceptance criteria**

- [ ] No sensitive child content logged by default
- [ ] Unexpected errors receive correlation/request ID
- [ ] Audit helper can record admin/domain events
- [ ] User sees safe error states

---

## M1 Curriculum

### M1-01 — Implement curriculum database schema

**Priority:** P0  
**Size:** L  
**Dependencies:** M0-02

Add source documents, curriculum versions, domains, topics, outcomes and relationships as incremental migrations.

**Acceptance criteria**

- [ ] Schema matches DATA_MODEL.md intent
- [ ] Foreign keys and required indexes exist
- [ ] Published curriculum records are not edited through normal service APIs
- [ ] Migration tests pass

---

### M1-02 — Build curriculum repository and domain services

**Priority:** P0  
**Size:** M  
**Dependencies:** M1-01

Implement typed repositories and query services for curriculum tree/outcomes.

**Acceptance criteria**

- [ ] Fetch curriculum by subject/version/level
- [ ] Fetch outcomes by topic
- [ ] Repository enforces version scoping
- [ ] Unit/integration tests cover queries

---

### M1-03 — Create curriculum source/provenance workflow

**Priority:** P0  
**Size:** M  
**Dependencies:** M1-01, M1-02

Support source document registration and evidence links to outcomes.

**Acceptance criteria**

- [ ] Each outcome can have one or more source references
- [ ] Source page/section and verification state stored
- [ ] Admin can see evidence for an outcome
- [ ] No outcome is publishable without at least one source

---

### M1-04 — Define P3 Maths curriculum import format

**Priority:** P0  
**Size:** M  
**Dependencies:** M1-02, M1-03

Create a version-controlled CSV/JSON import contract for verified P3 Maths curriculum data.

**Acceptance criteria**

- [ ] Schema documented
- [ ] Importer validates IDs/levels/source refs
- [ ] Importer is idempotent
- [ ] Invalid rows fail with actionable errors

---

### M1-05 — Seed verified P3 Maths curriculum

**Priority:** P0  
**Size:** L  
**Dependencies:** M1-04

Populate the P3 Mathematics curriculum from verified source material.

**Acceptance criteria**

- [ ] All seeded outcomes reference source documents
- [ ] Stable codes are unique
- [ ] No invented outcome is inserted
- [ ] Seed can rerun safely
- [ ] Human verification checklist completed

---

### M1-06 — Build admin curriculum browser

**Priority:** P1  
**Size:** M  
**Dependencies:** M1-02, M1-03, M0-04

Provide read-oriented admin UI to browse version -> domain -> topic -> outcome -> evidence.

**Acceptance criteria**

- [ ] Admin-only access
- [ ] Shows source provenance
- [ ] Filters by level/topic
- [ ] Clearly labels draft/published curriculum version

---

### M1-07 — Build parent-safe curriculum selection API

**Priority:** P0  
**Size:** M  
**Dependencies:** M1-02, M1-05

Expose only active/published curriculum nodes required by assessment setup.

**Acceptance criteria**

- [ ] Parent can fetch P3 Maths topics/outcomes
- [ ] Draft/retired records excluded
- [ ] API response stable and typed
- [ ] Ownership is not relevant to public curriculum but auth is required for app route

---

## M2 Question Bank

### M2-01 — Implement question-bank schema and versioning

**Priority:** P0  
**Size:** L  
**Dependencies:** M1-01

Add question families, immutable versions, outcome mappings, assets and reviews.

**Acceptance criteria**

- [ ] Approved/used version cannot be edited in place
- [ ] Primary outcome required before approval
- [ ] Version uniqueness enforced
- [ ] Indexes support generation queries

---

### M2-02 — Build question content and answer schemas

**Priority:** P0  
**Size:** L  
**Dependencies:** M2-01

Define structured JSON schemas for P3 Maths question content, answer schema, solution and rendering metadata.

**Acceptance criteria**

- [ ] Supports numeric, short answer and MCQ first
- [ ] Fractions/math expressions have canonical representation
- [ ] Schemas server-validated
- [ ] Fixtures demonstrate each supported question type

---

### M2-03 — Create admin question editor

**Priority:** P0  
**Size:** L  
**Dependencies:** M2-01, M2-02, M1-06

Build admin UI to create question family/version, map outcomes and enter answer/solution.

**Acceptance criteria**

- [ ] Cannot save malformed content
- [ ] Can select primary and secondary outcomes
- [ ] Preview renders as pupil will see it
- [ ] Draft autosave or explicit safe save exists

---

### M2-04 — Implement question review and approval workflow

**Priority:** P0  
**Size:** M  
**Dependencies:** M2-03, M0-08

Add review checklist and state transitions.

**Acceptance criteria**

- [ ] Approval requires curriculum validity, answer validity and clarity confirmation
- [ ] Audit trail stored
- [ ] Only authorised admin can approve
- [ ] Retired questions excluded from generation

---

### M2-05 — Implement deterministic answer verification utilities

**Priority:** P0  
**Size:** M  
**Dependencies:** M2-02

Create reusable validators for numeric/fraction/simple MCQ answer correctness.

**Acceptance criteria**

- [ ] Canonicalises supported answers
- [ ] Handles equivalent fractions where intended
- [ ] No floating-point equality errors for exact Maths
- [ ] Unit tests cover edge cases

---

### M2-06 — Build question-bank filters and search

**Priority:** P1  
**Size:** M  
**Dependencies:** M2-01, M1-02

Filter admin questions by level/topic/outcome/type/difficulty/status.

**Acceptance criteria**

- [ ] Filters combine correctly
- [ ] Pagination supported
- [ ] Approved-only query path efficient
- [ ] Relevant indexes used

---

### M2-07 — Seed first approved P3 Maths question set

**Priority:** P0  
**Size:** L  
**Dependencies:** M2-03, M2-04, M2-05

Create a curated set sufficient to generate multiple papers for at least one meaningful P3 Maths scope.

**Acceptance criteria**

- [ ] Minimum agreed inventory per selected outcome exists
- [ ] Every question has answer and worked solution
- [ ] All items human-approved
- [ ] No copyrighted exam questions copied without rights

---

### M2-08 — Add question-bank quality test suite

**Priority:** P0  
**Size:** M  
**Dependencies:** M2-01, M2-02, M2-04

Add automated consistency checks across approved questions.

**Acceptance criteria**

- [ ] Approved questions always have primary outcome
- [ ] Marks positive
- [ ] Answer schema valid
- [ ] Referenced assets exist
- [ ] No duplicate family/version
- [ ] Test fails on intentionally broken fixture

---

## M3 Assessment Builder

### M3-01 — Implement child profile CRUD with ownership

**Priority:** P0  
**Size:** M  
**Dependencies:** M0-03, M0-04, M0-07

Allow parent to create/edit/archive minimal child profiles.

**Acceptance criteria**

- [ ] Parent sees only own children
- [ ] Required fields nickname/level/year
- [ ] School optional/selectable
- [ ] No sensitive child fields added

---

### M3-02 — Implement upcoming assessment creation

**Priority:** P0  
**Size:** M  
**Dependencies:** M3-01, M1-07

Create P3 Maths assessment record with type/date/name and curriculum version.

**Acceptance criteria**

- [ ] Assessment belongs to child owner
- [ ] P3 Maths is only enabled MVP route
- [ ] Applicable curriculum version selected explicitly
- [ ] Draft assessment can be edited

---

### M3-03 — Implement manual assessment scope selector

**Priority:** P0  
**Size:** L  
**Dependencies:** M3-02, M1-07

Parent selects confirmed P3 Maths topics/outcomes.

**Acceptance criteria**

- [ ] Displays parent-friendly topic labels
- [ ] Stores exact outcome/topic IDs
- [ ] Parent can edit before confirmation
- [ ] Confirmed state clearly shown
- [ ] No out-of-version outcomes accepted

---

### M3-04 — Implement assessment requirements form

**Priority:** P1  
**Size:** M  
**Dependencies:** M3-02

Capture duration, marks and supported format preferences.

**Acceptance criteria**

- [ ] Duration/marks validated
- [ ] Defaults are editable suggestions, not school claims
- [ ] Values stored separately from curriculum scope
- [ ] Invalid values blocked

---

### M3-05 — Implement blueprint generation service

**Priority:** P0  
**Size:** L  
**Dependencies:** M3-03, M3-04

Convert confirmed scope and requirements into a draft blueprint.

**Acceptance criteria**

- [ ] All confirmed required outcomes represented
- [ ] Mark targets sum to total or validator flags them
- [ ] Difficulty percentages sum to 100
- [ ] Blueprint is versioned
- [ ] Service unit tests cover normal and impossible cases

---

### M3-06 — Implement blueprint validation engine

**Priority:** P0  
**Size:** L  
**Dependencies:** M3-05, M2-06, M2-08

Validate marks, scope coverage, supported question types, available inventory and duration warnings.

**Acceptance criteria**

- [ ] Hard errors and warnings separated
- [ ] Impossible blueprint cannot be used
- [ ] Insufficient approved question inventory is reported
- [ ] No silent auto-correction
- [ ] Validation deterministic and tested

---

### M3-07 — Build parent blueprint review screen

**Priority:** P0  
**Size:** M  
**Dependencies:** M3-05, M3-06, M0-04

Show simple parent-readable summary with optional advanced detail.

**Acceptance criteria**

- [ ] Shows duration/marks/topics/difficulty
- [ ] Parent can go back and edit scope
- [ ] Validation errors actionable
- [ ] Curriculum jargon hidden by default

---

### M3-08 — Create question-selection preview service

**Priority:** P1  
**Size:** L  
**Dependencies:** M3-06, M2-07

Implement deterministic candidate selection preview without freezing a paper.

**Acceptance criteria**

- [ ] Uses approved questions only
- [ ] Matches curriculum version and scope
- [ ] Avoids duplicate question IDs
- [ ] Returns exact total marks when possible
- [ ] Returns structured failure reason otherwise

---

## M4 Printable Mock

### M4-01 — Implement paper and paper-question schema

**Priority:** P0  
**Size:** M  
**Dependencies:** M2-01, M3-05

Add frozen paper instances and ordered exact question-version references.

**Acceptance criteria**

- [ ] Paper references exact question IDs/versions
- [ ] Question list immutable after generated status
- [ ] Paper version unique per assessment
- [ ] Cascade/restrict rules protect history

---

### M4-02 — Implement deterministic paper selection algorithm

**Priority:** P0  
**Size:** L  
**Dependencies:** M4-01, M3-08

Select questions satisfying blueprint hard constraints and optimising soft constraints.

**Acceptance criteria**

- [ ] Exact total marks
- [ ] Required scope covered
- [ ] Approved questions only
- [ ] No duplicate question
- [ ] Respects allowed types
- [ ] Difficulty distribution reported
- [ ] Failure is explicit when no valid set exists

---

### M4-03 — Implement final paper validation

**Priority:** P0  
**Size:** M  
**Dependencies:** M4-02, M2-08

Validate selected paper before freezing/rendering.

**Acceptance criteria**

- [ ] Total marks exact
- [ ] Question numbering/order valid
- [ ] Every question has answer
- [ ] All assets resolvable
- [ ] Scope report generated
- [ ] Validation failure prevents generation

---

### M4-04 — Build deterministic student-paper renderer

**Priority:** P0  
**Size:** XL  
**Dependencies:** M4-03, M0-05

Render an A4 printable student paper from structured paper data.

**Acceptance criteria**

- [ ] Header shows subject/mock/duration/marks
- [ ] Questions paginate cleanly
- [ ] Working space configurable
- [ ] Maths/fractions render correctly
- [ ] No answers appear
- [ ] Page numbers present
- [ ] Representative fixture manually reviewed

---

### M4-05 — Build parent answer-pack renderer

**Priority:** P0  
**Size:** L  
**Dependencies:** M4-04

Render separate answer key and worked solutions.

**Acceptance criteria**

- [ ] Question numbering matches student paper
- [ ] Marks shown
- [ ] Worked solution included when available
- [ ] Curriculum mapping can be included in parent section
- [ ] Stored privately

---

### M4-06 — Implement paper generation command and history UI

**Priority:** P0  
**Size:** L  
**Dependencies:** M4-02, M4-03, M4-04, M4-05

Create/freeze/render paper and show prior generated versions.

**Acceptance criteria**

- [ ] Generation is idempotent for request key
- [ ] New regenerate action creates new paper version
- [ ] Parent sees own papers only
- [ ] Download uses authorised signed URL
- [ ] Status/errors shown clearly

---

### M4-07 — Add PDF golden tests and structural checks

**Priority:** P0  
**Size:** M  
**Dependencies:** M4-04, M4-05

Add fixture-based rendering tests and PDF metadata/page checks.

**Acceptance criteria**

- [ ] Known fixture renders consistently
- [ ] Student fixture contains no answer text markers
- [ ] Answer pack contains expected solution markers
- [ ] Page count/mark metadata tested where feasible

---

### M4-08 — Create end-to-end Milestone 4 parent flow

**Priority:** P0  
**Size:** L  
**Dependencies:** M4-06, M4-07

Automate main workflow from sign-in to paper generation.

**Acceptance criteria**

- [ ] E2E covers child -> assessment -> scope -> blueprint -> generate
- [ ] Student PDF and answer pack records created
- [ ] Access control tested for another user
- [ ] CI runs reliable E2E smoke path

---


# Cross-cutting UX gates for M0–M4

Apply `docs/UX_PRINCIPLES.md` and `docs/USABILITY_ACCEPTANCE_CRITERIA.md` to every family-facing issue.

Before M4 exit:
- parent shell uses four primary destinations;
- assessment setup standard path hides blueprint complexity;
- Home is state-driven;
- mock routes use isolated Mock Mode layout;
- parent can reach the recommended next action from Home in one tap;
- core flow is E2E tested on phone and iPad viewport;
- no mandatory tutorial exists.
