# UX / Experience Backlog

These items are cross-cutting and should be scheduled alongside M0–M4 rather than postponed until the end.

## UX-01 — Implement parent four-destination shell
**Priority:** P0

Acceptance:
- Home / Prepare / Progress / Rewards only;
- responsive tab/sidebar treatment;
- profile/settings outside primary nav;
- active state preserved.

## UX-02 — Implement child four-destination shell
**Priority:** P0

Acceptance:
- Today / Practice / Progress / Rewards only;
- child mode visually distinct from parent mode;
- no parent-management actions exposed.

## UX-03 — Implement state-driven parent Home
**Priority:** P0

Acceptance:
- one primary recommended action;
- action resolves deterministically from state;
- unit tests cover major states;
- supporting cards do not visually compete.

## UX-04 — Implement child Today mission
**Priority:** P0

Acceptance:
- one recommended mission;
- resume unfinished activity takes priority;
- curriculum browsing is secondary;
- done-for-today state supported.

## UX-05 — Simplify assessment setup to Upload -> Confirm -> Generate
**Priority:** P0

Acceptance:
- standard flow does not expose blueprint;
- extracted school scope appears in confirmation context;
- advanced paper settings under Customise;
- usable manual-entry fallback.

## UX-06 — Dedicated iPad Mock Mode layout
**Priority:** P0

Acceptance:
- no normal navigation;
- no gamification/hints in full mock;
- autosave;
- unanswered review;
- timer/progress/question navigation;
- touch/Pencil controls meet target-size/spacing requirements.

## UX-07 — Marked-paper split review
**Priority:** P1

Acceptance:
- paper remains dominant;
- feedback tied to selected question;
- original answer/working visible;
- wrong answers lead to worked solution/similar practice;
- mobile fallback is usable.

## UX-08 — Action-oriented Results
**Priority:** P0

Acceptance:
- result, change, gap and next action appear before detailed analytics;
- parent and child result surfaces differ appropriately;
- one dominant CTA.

## UX-09 — Contextual first-use guidance
**Priority:** P1

Acceptance:
- no mandatory onboarding carousel;
- first-use tips are dismissible and near the task;
- core flows remain understandable without tips.

## UX-10 — Core-flow instrumentation
**Priority:** P1

Acceptance:
- records flow state transitions/abandonment without unnecessary child content;
- can calculate setup completion and next-action click-through;
- help-open events available as friction signal.

## UX-11 — Parent task usability test
**Priority:** P0 before broad beta

Test prompt: "Your child's school has sent this assessment notice. Prepare your child."

Acceptance:
- record unassisted completion;
- document wrong turns/questions;
- fix recurring "what do I press now?" problems;
- early target >=80% unassisted core setup.

## UX-12 — Child iPad task usability test
**Priority:** P0 before broad beta

Test prompt: "Do this mock paper."

Acceptance:
- child starts without instruction;
- no systematic navigation confusion;
- no accidental submit pattern;
- child can find/review mistakes after results.
