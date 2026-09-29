# PaperKaki — Claude Code Project Instructions

## Product objective

Build a Singapore primary-school assessment preparation platform that feels simple enough to use without a manual.

First supported vertical slice: **Primary 3 Mathematics**.

Core learning flow:

`School assessment -> confirm scope -> generate mock -> attempt -> mark -> diagnose -> practise -> next mock`

Motivation flow:

`Meaningful learning -> improvement/mastery -> Learning Points -> parent-defined rewards`

## Required reading

Before substantial work, read:

1. `docs/PRD.md`
2. `docs/UX_PRINCIPLES.md`
3. `docs/INFORMATION_ARCHITECTURE.md`
4. `docs/UX_SPEC.md`
5. `docs/USABILITY_ACCEPTANCE_CRITERIA.md`
6. `docs/ARCHITECTURE.md`
7. `docs/DATA_MODEL.md`
8. `docs/GAMIFICATION_REWARDS_SPEC.md`
9. `docs/ROADMAP.md`
10. relevant ADRs;
11. active backlog item.

## UX is a product invariant

A technically correct feature is not complete if the user flow becomes confusing.

### Non-negotiable UX rules

1. **One dominant action per important screen.**
2. **Recommend first; customise second.**
3. **Maximum four primary navigation destinations** for ordinary parent and child experiences.
4. **No mandatory tutorial carousel or training video** for core flows.
5. **Teach in context**, at the moment a user needs help.
6. **Use progressive disclosure.** Advanced options are hidden by default.
7. **Recognition over recall.** Keep relevant choices, state and context visible.
8. **Resume state.** Returning users should resume where they left off.
9. **Do not expose implementation language** such as blueprint, outcome IDs, policy multipliers, extraction schemas, or AI confidence internals in the normal experience.
10. **Every result leads to a next action.** Never show a gap without a path to address it.
11. Parent and child are different experiences sharing the same data.
12. During full Mock Mode, remove gamification, hints and unrelated navigation.
13. Do not add a top-level destination because there is screen space. Navigation structure is intentional.
14. All primary touch targets must meet applicable accessibility sizing/spacing guidance.

### Parent primary navigation

Only:
- Home
- Prepare
- Progress
- Rewards

Child primary navigation:
- Today
- Practice
- Progress
- Rewards

Settings are accessed from account/profile. Child selection is a selector, not a permanent primary navigation item.

Admin navigation is separate and may be more complex.

## State-driven Home

Home is not a static reporting dashboard. It is a decision surface.

Its primary action is derived from current state, for example:
- add upcoming assessment;
- confirm uploaded scope;
- generate first mock;
- continue mock;
- review results;
- review mistakes;
- practise weak area;
- generate next mock;
- done for today.

The Home screen should not require the user to inspect several charts to determine what to do next.

## Working method

For each substantial issue:

1. Inspect existing code/tests.
2. Plan files, data/API impact, UX states, tests and risks.
3. Implement only the issue scope.
4. Verify typecheck, lint, unit/integration/E2E tests as applicable.
5. Review the final diff against product and UX rules.
6. Report actual test results, limitations and follow-up.

Never claim tests passed unless executed.

## Domain rules

### Curriculum
- Never invent curriculum outcomes.
- Curriculum facts require provenance.
- Published curriculum versions are historical records.
- Never hard-code curriculum facts in UI components.

### Assessment
- School scope is configuration over common curriculum.
- Historical school patterns are evidence, never guarantees.
- Build a structured blueprint internally before paper generation.
- Ordinary parent UI should call it a "mock setup", "paper settings" or simply hide it.

### Questions
- Every usable question maps to curriculum outcome(s).
- Generated questions require independent answer validation.
- Questions are versioned.
- Attempted papers are immutable.

### Marking
- Deterministic logic before AI.
- AI marking returns score, max score, confidence, reason and review flag.
- Low-confidence decisions route to review.
- Child-facing UI should say "We need a quick check" rather than expose raw model confidence.

### Gamification
- Reward learning, not volume.
- RewardEngine is deterministic and versioned.
- Never let an LLM decide points.
- Repeated easy mastered work receives sharply diminishing rewards.
- Reward improvement, first mastery, review, retention, variety and appropriate challenge.
- Parents define and approve real-world rewards.
- Point ledger is append-only.
- Gamification is hidden during full Mock Mode.

### Privacy
- Parent/guardian owns account and child profile.
- Do not collect child NRIC, student ID, exact DOB or home address.
- Child uploads are private.
- No production personal data in tests.
- No permanent public file URLs.

## Architecture boundaries

Domain modules:
- `src/domain/curriculum`
- `src/domain/questions`
- `src/domain/assessments`
- `src/domain/papers`
- `src/domain/attempts`
- `src/domain/marking`
- `src/domain/mastery`
- `src/domain/rewards`
- `src/domain/recommendations`

Services:
- `src/services/ai`
- `src/services/storage`
- `src/services/pdf`
- `src/services/jobs`
- `src/services/auth`

Persistence:
- `src/repositories`

Validation:
- `src/schemas`

UI must not contain scoring, question-selection, reward-calculation or mastery rules.

## Deterministic-first rule

Use deterministic code for:
- arithmetic;
- marks and percentages;
- question numbering;
- curriculum lookups;
- paper validation;
- supported answer checking;
- reward calculation;
- point balances and redemption;
- state/action selection where explicit product rules exist.

## AI rule

All model calls go through a central gateway. Business-critical outputs must be schema validated. Do not parse arbitrary free-form prose for business logic.

## Testing

Domain rules need unit tests. Critical flows need integration/E2E tests. AI workflows need eval fixtures. Reward changes need deterministic reward fixtures.

For user-facing work, also check `docs/USABILITY_ACCEPTANCE_CRITERIA.md`.

## Current priority

Prove this first:

`P3 Maths scope -> validated paper -> excellent print/iPad mock experience`

Do not expand to all subjects/levels, complex analytics, subscriptions or a large dashboard before the core loop is excellent.
