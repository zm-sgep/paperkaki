# Technical Architecture

## 1. Architecture choice

Use a **modular monolith** for the MVP.

Reasons:
- one small product team;
- strong transactional relationships between curriculum, questions, blueprints, papers, marking, mastery and rewards;
- easier local development;
- simpler deployment and debugging;
- service boundaries can be extracted later if scale requires it.

Do not begin with microservices.

## 2. Recommended stack

Reference implementation:

- Web: current stable Next.js App Router + TypeScript.
- UI: React + Tailwind CSS + accessible component primitives.
- Database: PostgreSQL.
- Typed SQL/ORM: Drizzle ORM or equivalent.
- Auth: managed auth.
- Object storage: private S3-compatible or managed private storage.
- Background jobs: provider behind a `JobService` interface.
- PDF: deterministic server-side rendering from structured paper data.
- Maths rendering: KaTeX/MathML where suitable.
- Precise diagrams: deterministic SVG/React components.
- AI: provider-independent `AIService`.
- Observability: structured logs + error tracking; add AI/job traces later.

Avoid hard-pinning framework versions in architecture documentation. Use supported stable versions at implementation time.

## 3. Logical layers

```text
Browser / iPad
  |
  v
Next.js UI / Route handlers
  |
  v
Application services
  |
  +--> Domain modules
  |      curriculum
  |      questions
  |      assessments
  |      papers
  |      marking
  |      mastery
  |      rewards
  |
  +--> Repositories --> PostgreSQL
  |
  +--> Service adapters
         Auth
         Storage
         PDF
         Jobs
         AI
```

## 4. Folder layout

```text
src/
  app/                      # routes follow INFORMATION_ARCHITECTURE.md (ADR-0009)
    (auth)/sign-in/
    (parent)/home/
    (parent)/prepare/
    (parent)/progress/
    (parent)/rewards/
    (parent)/account/       # children, school, settings: not primary navigation
    (child)/                # later: today, practice, progress, rewards
    mock/[attemptId]/       # later: isolated Mock Mode layout
    admin/

  components/
    ui/
    assessment/
    curriculum/
    paper/
    marking/
    rewards/

  domain/
    curriculum/
    questions/
    assessments/
    papers/
    attempts/
    marking/
    mastery/
    rewards/
    recommendations/        # next-action policy (ADR-0008)

  application/
    commands/
    queries/

  repositories/
    postgres/

  services/
    ai/
    storage/
    pdf/
    jobs/
    auth/

  schemas/
  lib/
  config/

tests/
  unit/
  integration/
  e2e/

evals/
  scope-extraction/
  curriculum-mapping/
  question-generation/
  marking/
  rewards/
```

## 5. Bounded contexts

### Curriculum
Owns:
- curriculum versions;
- domains/topics/outcomes;
- prerequisite/progression relationships;
- source provenance.

### Question bank
Owns:
- question families;
- question versions;
- outcome mappings;
- answers/solutions;
- review/approval;
- provenance.

### Assessments
Owns:
- upcoming assessment;
- parent-confirmed scope;
- blueprint;
- blueprint validation.

### Papers
Owns:
- frozen paper instances;
- question ordering;
- mark totals;
- rendering input;
- paper immutability.

### Marking
Owns:
- submissions;
- extracted responses;
- scoring;
- confidence;
- human review.

### Mastery
Owns:
- mastery evidence;
- outcome-level state;
- spaced retention eligibility.

### Rewards
Owns:
- reward policy;
- Learning Points;
- anti-farming rules;
- parent reward catalogue;
- redemptions.

Rewards consumes mastery state. It never decides academic mastery itself.

## 6. Application commands

Examples:
- `CreateChild`
- `CreateAssessment`
- `SetAssessmentScope`
- `BuildBlueprint`
- `ValidateBlueprint`
- `GeneratePaper`
- `ApproveQuestion`
- `SubmitAttempt`
- `MarkAttempt`
- `RecordMasteryEvidence`
- `CalculateReward`
- `RequestRewardRedemption`
- `ApproveRewardRedemption`

All commands must:
- authenticate;
- authorise resource ownership;
- validate payload;
- enforce domain rules;
- run transactionally where needed.

## 7. Assessment generation pipeline

```text
Confirmed assessment scope
      |
      v
Create blueprint
      |
      v
Blueprint validation
      |
      v
Build candidate question pool
      |
      v
Question selection algorithm
      |
      v
Paper structural validation
      |
      v
Freeze paper + question versions
      |
      +--> Render student PDF
      |
      +--> Render iPad attempt representation
      |
      +--> Render parent answer pack
```

M0–M4 should not require AI for paper creation. The first system should work using a curated question bank.

## 8. Question selection algorithm

Start deterministic.

Hard constraints:
- approved question only;
- correct curriculum version/level;
- within selected scope;
- total marks exact;
- required coverage rules met;
- no duplicate question version;
- no disallowed family repetition.

Soft constraints:
- difficulty distribution;
- varied question types;
- varied families;
- estimated duration;
- later: child-specific weak-area weighting.

Initial implementation can use backtracking/weighted search. Do not add an optimisation solver until needed.

## 9. Paper immutability

A generated paper stores exact question version IDs.

If a question changes later, create a new version.

If a paper is regenerated, create a new paper version.

Never mutate an attempted paper.

## 10. iPad attempt architecture

Represent the same frozen paper in a digital attempt layer.

Store separately:
- attempt session;
- question navigation state;
- elapsed time;
- autosave state;
- typed/selected answer;
- drawing/handwriting strokes or rendered image;
- submit timestamp.

Do not alter question content in digital mode.

Apple Pencil handwriting should be stored as vector/stroke data where practical, with rendered snapshots for marking pipelines.

During an active exam session:
- suppress gamification UI;
- avoid distracting animations;
- keep navigation and timer prominent;
- autosave locally/server-side.

## 11. PDF architecture

Represent paper as structured domain data first.

Renderer responsibilities only:
- pagination;
- typography;
- question layout;
- working space;
- tables/diagrams;
- page numbering.

Renderer must not decide curriculum or question selection.

## 12. Storage

Private storage categories:
- `assessment-source-uploads`;
- `paper-pdfs`;
- `submission-uploads`;
- `question-assets`;
- optional `attempt-handwriting`.

Store object keys, not public URLs.

Use short-lived signed URLs after authorisation.

## 13. Auth and authorisation

Parent is account owner.

Every child/assessment/paper/result/reward query must be ownership-scoped.

Admin role is separate and auditable.

Child mode can be a constrained profile/session under the parent account rather than an independent legal account for MVP.

## 14. AI gateway

All model calls use a central interface.

Example:

```ts
interface AIService {
  extractAssessmentScope(input: ScopeExtractionInput): Promise<ScopeExtractionResult>
  mapCurriculum(input: CurriculumMappingInput): Promise<CurriculumMappingResult>
  generateQuestion(input: QuestionGenerationInput): Promise<QuestionDraft>
  validateQuestion(input: QuestionValidationInput): Promise<QuestionValidationResult>
  markResponse(input: MarkingInput): Promise<MarkingResult>
  diagnoseError(input: DiagnosisInput): Promise<DiagnosisResult>
}
```

All outputs validate against schemas.

AI must not calculate Learning Points.

## 15. Background jobs

Introduce durable jobs once workflows include:
- OCR;
- multi-page processing;
- AI question generation;
- batch validation;
- handwriting marking.

Job state:
`queued -> running -> succeeded | failed`.

Reward recording should be idempotent if triggered from jobs.

## 16. Mastery architecture

Mastery records evidence rather than a single mutable score.

Evidence examples:
- question performance;
- difficulty;
- first attempt vs retry;
- session;
- question-family variety;
- timestamp.

A mastery-calculation service derives current state.

Reward logic reads this derived state.

## 17. Rewards architecture

### 17.1 Domain module

```text
src/domain/rewards/
  entities.ts
  reward-policy.ts
  reward-engine.ts
  anti-farming.ts
  ledger.ts
  redemption.ts
```

### 17.2 Deterministic RewardEngine

Input example:

```ts
type RewardContext = {
  childId: string
  sourceEventId: string
  activityType: "mock" | "practice" | "review" | "retention"
  outcomeIds: string[]
  firstMeaningfulAttempt: boolean
  accuracy?: number
  previousAccuracy?: number
  masteryBefore: MasteryState
  masteryAfter: MasteryState
  difficulty: "basic" | "standard" | "challenging"
  repeatedFamilyCountRecent: number
  topicRewardedSessionsRecent: number
  spacedReviewDue: boolean
  reviewedMistakes: boolean
}
```

Output:

```ts
type RewardDecision = {
  points: number
  reasonCodes: RewardReason[]
  policyVersion: string
  multipliers: Record<string, number>
  capped: boolean
  capReason?: string
  recommendedNextAction?: RecommendedLearningAction
}
```

The engine must be pure/fixture-testable.

### 17.3 Reward policy

Store configurable/versioned values in one reward policy.

Examples:
- base points by activity;
- mastery multiplier;
- first-attempt factor;
- improvement bonus;
- repetition decay;
- topic saturation;
- retention bonus;
- variety bonus;
- max points per activity.

Policy changes create a new version.

### 17.4 Append-only ledger

Never treat a mutable points balance as authoritative.

Authoritative balance = sum of ledger entries.

Optional cached balance may exist for performance.

Corrections use compensating entries.

### 17.5 Anti-farming evaluator

Evaluate:
- repeated question families;
- same-topic rewarded sessions;
- mastery state;
- difficulty;
- first-attempt status;
- reliable low-effort/random-response signals.

Normal response is lower reward plus redirection, not punishment.

### 17.6 Parent reward aggregate

Fields:
- title;
- description;
- point cost;
- active;
- child scope;
- limits;
- availability window.

Redemption state:
`requested -> approved -> fulfilled`
or
`requested -> rejected`.

Default point deduction occurs on approval.

### 17.7 Idempotency

Every automated reward-triggering event has a stable `sourceEventId`.

Unique constraint prevents double awards.

## 18. Security baseline

- secure session handling;
- server-side ownership checks;
- file validation;
- file-size caps;
- private storage;
- rate limits;
- secrets in managed environment;
- parameterised SQL;
- no personal data in logs;
- audit admin actions;
- no real child data in test fixtures.

## 19. CI pipeline

Required:
1. install;
2. typecheck;
3. lint;
4. unit tests;
5. integration tests;
6. build;
7. migration validation.

Later:
- E2E;
- AI evals;
- reward policy fixture suite.

## 20. Architectural exit criteria for M4

By end of M4:
- curriculum is versioned and source-backed;
- curated question bank exists;
- parent can create scope and blueprint;
- selector creates valid papers;
- paper is frozen/versioned;
- student and answer PDFs render reliably;
- iPad representation can consume the same paper model;
- critical flows have automated tests.


# Experience Architecture

## Recommendation / Next Action service

Create a deterministic application/domain service that resolves the current best next action from product state.

Example interface:

```ts
type NextAction = {
  kind: "add_assessment" | "confirm_scope" | "generate_mock" | "start_mock" | "continue_mock" | "review_result" | "review_mistakes" | "start_practice" | "generate_next_mock" | "done_today"
  title: string
  supportingText?: string
  href: string
  priority: number
}
```

Do not implement Home as a client-side collection of unrelated if-statements. Centralise the state-to-action policy and test it.

## Navigation state

Parent and child navigation concepts must remain stable across screen sizes. Responsive presentation may change from tab bar to sidebar, but destination semantics do not.

## Mock isolation

Active full-mock routes use a dedicated layout without ordinary parent/child navigation. This prevents accidental exits and removes irrelevant stimuli.

## Progressive disclosure

Store advanced configuration in the same domain model, but do not require advanced forms in the normal path. Recommended defaults are generated server-side/application-side and may be overridden explicitly.

## UX telemetry

Instrument state transitions and abandonment for core flows. Do not record unnecessary child content. Suggested events include:
- home_next_action_shown/clicked;
- assessment_setup_started/completed;
- scope_confirmed/edited;
- paper_customise_opened;
- mock_started/resumed/submitted;
- results_next_action_clicked;
- contextual_help_opened.

Use this to find friction, not to pressure children.
