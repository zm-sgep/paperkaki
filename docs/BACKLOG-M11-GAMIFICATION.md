# GitHub Backlog — Milestone 11 Gamification & Rewards

Prerequisite: marking, mastery and practice milestones exist.

## M11-01 — Implement reward policy schema and repository
**Priority:** P0  
**Size:** M

Acceptance criteria:
- active policy can be resolved by effective time;
- historical policies are immutable through normal service APIs;
- policy JSON validates against typed schema;
- tests cover active/draft/retired selection.

## M11-02 — Implement append-only point ledger and reconciliation
**Priority:** P0  
**Size:** L

Acceptance criteria:
- automated events require source event ID;
- duplicate source event cannot award twice;
- balance equals ledger sum;
- prior entries are not mutated;
- corrections use compensating entries.

## M11-03 — Implement deterministic RewardEngine
**Priority:** P0  
**Size:** XL

Acceptance criteria:
- pure/fixture-testable decision function;
- returns points, reasons, policy version, multipliers and next-action suggestion;
- mastered easy work yields sharply lower points than weak-topic improvement;
- no LLM involved.

## M11-04 — Implement repetition and saturation anti-farming rules
**Priority:** P0  
**Size:** L

Acceptance criteria:
- same-family repeats decay;
- repeated mastered-topic sessions decay;
- spaced retention can restore moderate reward;
- harder transfer activity retains more reward than easy repeat;
- child-facing message remains encouraging.

## M11-05 — Integrate mastery/activity events with rewards
**Priority:** P0  
**Size:** L

Acceptance criteria:
- each eligible activity produces at most one automated reward event;
- first mastery bonus happens once;
- mistake review can earn separate points;
- reward failure does not corrupt academic result.

## M11-06 — Build child points and mastery celebration UI
**Priority:** P1  
**Size:** L

Acceptance criteria:
- child sees simple reason, not raw multiplier math;
- mastered-repeat flow redirects to useful next task;
- works well on iPad and mobile;
- no shame/punishment wording.

## M11-07 — Implement parent reward catalogue
**Priority:** P0  
**Size:** L

Acceptance criteria:
- parent owns catalogue;
- optional child-specific reward;
- cost positive;
- availability/limits validated;
- inactive rewards hidden from child redemption UI.

## M11-08 — Implement reward redemption approval flow
**Priority:** P0  
**Size:** L

Acceptance criteria:
- cannot approve if balance insufficient;
- approval produces exactly one debit ledger entry;
- reject produces no debit;
- refund uses compensating entry;
- another parent cannot act on request.

## M11-09 — Build parent gamification analytics
**Priority:** P1  
**Size:** M

Acceptance criteria:
- learning-earned and manual-parent points separated;
- reason breakdown visible;
- no misleading productivity metric based on time/question count;
- parent can inspect simplified ledger history.

## M11-10 — Add gamification E2E and anti-farming test suite
**Priority:** P0  
**Size:** L

Acceptance criteria:
- weak-topic improvement > mastered easy repeat;
- repeated mastered activity decays across sessions;
- spaced retention earns moderate points;
- duplicate event idempotent;
- child request -> parent approval -> one balance deduction;
- policy version preserved in ledger.
