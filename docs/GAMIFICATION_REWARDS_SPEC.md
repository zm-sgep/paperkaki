# Gamification, Anti-Farming and Parent Rewards — Technical Product Specification

## 1. Objective

Add motivation without creating a “do more questions to farm coins” system.

The economically attractive behaviour for the child should broadly align with educationally useful behaviour:
- work on relevant gaps;
- improve;
- review mistakes;
- achieve mastery;
- retain learning;
- move on after mastery.

## 2. Visible concepts

### Learning Points
Single child-facing currency.

### Mastery
Academic state owned by the mastery domain.

Suggested states:
- `not_started`
- `learning`
- `developing`
- `almost_mastered`
- `mastered`
- `retained`

### Parent Reward
A parent-defined real-world reward requested with points.

## 3. Reward reason codes

Initial set:

```text
activity_completion
improvement
first_mastery
weak_area_recovery
mistake_review
retention
healthy_variety
stretch_challenge
manual_parent_bonus
reward_redemption
reward_refund
```

## 4. Reduced/non-rewardable behaviours

### Exact/near repeat
Repeated use of the same question family in a short window.

### Mastered-easy repetition
Mastered outcome + same/easier difficulty + no meaningful spacing.

### Retry farming
Second/subsequent attempts on same item should not earn full base reward.

### Rapid random answering
Where robust evidence exists, award may be suppressed.
Do not infer this from speed alone.

## 5. Initial policy model

Values must be configurable and versioned.

Example starting policy only:

```json
{
  "version": "rewards-v1",
  "base": {
    "short_practice": 5,
    "targeted_practice": 10,
    "mock": 18,
    "mistake_review": 6,
    "retention_check": 6
  },
  "mastery_need_multiplier": {
    "not_started": 1.2,
    "learning": 1.6,
    "developing": 1.4,
    "almost_mastered": 1.2,
    "mastered": 0.3,
    "retained": 0.2
  },
  "difficulty_multiplier": {
    "basic": 1.0,
    "standard": 1.15,
    "challenging": 1.3
  },
  "first_meaningful_attempt": 1.0,
  "repeat_attempt": 0.15,
  "improvement_bonus_max": 0.5,
  "variety_bonus": 0.15,
  "retention_bonus": 0.35,
  "mastery_bonus": 12,
  "same_family_decay": [1.0, 0.6, 0.25, 0.1],
  "mastered_topic_session_decay": [1.0, 0.35, 0.1, 0.0]
}
```

These are product parameters, not educational facts. Tune from evidence.

## 6. Suggested calculation order

1. Determine base activity value.
2. Determine eligibility.
3. Apply first-attempt/retry factor.
4. Apply mastery-need factor.
5. Apply difficulty factor.
6. Add improvement bonus.
7. Add retention/variety/stretch bonuses where applicable.
8. Apply question-family repetition decay.
9. Apply mastered-topic saturation decay.
10. Apply activity/session cap.
11. Add one-time verified mastery bonus if applicable.
12. Round deterministically.
13. Record full calculation metadata.

## 7. Example scenarios

### A — weak fractions improves
Before: `developing`  
Previous accuracy: 45%  
Now: 75%  
Standard practice, first meaningful attempt.

Expected:
- healthy points;
- improvement reason;
- no farming penalty;
- possible weak-area recovery reason.

### B — mastered multiplication repeated
Before: `mastered`  
Third easy multiplication session today.

Expected:
- very low/zero points;
- redirect to relevant gap;
- no punitive wording.

### C — mastered multiplication, harder transfer
New challenging word-problem family.

Expected:
- moderate points;
- stretch-challenge reason;
- still less than genuine weak-area improvement if policy is configured that way.

### D — spaced retention
Mastered 12 days ago. Retention review is due. Performs strongly.

Expected:
- moderate points;
- retention reason;
- mastery may remain/move to retained.

### E — repeated same-question retries
Incorrect first attempt, then correct after several rapid retries.

Expected:
- retries earn little/no points;
- later mistake review can still earn points.

## 8. Nudging policy

When reward falls because of mastery/repetition, return a recommended next action.

Priority:
1. weak upcoming-assessment outcomes;
2. under-practised required outcomes;
3. mistake review due;
4. retention review due;
5. harder transfer activity in mastered topic.

Example:

```json
{
  "message": "You're already strong in Multiplication. Try Fractions next to earn more points and keep growing.",
  "recommended_action": {
    "type": "practice_outcome",
    "outcome_id": "..."
  }
}
```

## 9. Parent reward catalogue

Parent can configure:
- title;
- description;
- points cost;
- active state;
- child/all children;
- optional quantity;
- optional weekly redemption limit;
- optional availability period.

The app should not suggest what a parent must reward with.

## 10. Redemption

Default:
1. child requests;
2. balance checked;
3. no deduction yet;
4. parent approves;
5. negative ledger entry created transactionally;
6. status approved;
7. parent later marks fulfilled.

If rejected: no deduction.

If reversed: create refund ledger entry; never delete history.

## 11. Parent controls

Parent can:
- enable/disable rewards;
- add/edit/retire rewards;
- approve/reject requests;
- give manual bonus with reason;
- inspect earning breakdown;
- set optional redemption limits.

Manual parent bonuses are analytically separate from learning-earned points.

## 12. Child UI

Child home:
- point balance;
- nearest reward;
- recommended task;
- mastery progress;
- recent points.

After activity:
- short celebration;
- points earned;
- why;
- mastery movement;
- recommended next step.

When points are low because content is mastered:
- celebrate strength;
- redirect;
- do not emphasise “loss”.

## 13. Parent UI

Show:
- points earned this week;
- learning-earned vs manual bonus;
- reasons;
- mastery bonuses;
- reward requests;
- redemption history;
- notable low-yield mastered-topic practice.

## 14. Commands

```text
CalculateReward
RecordRewardDecision
GetChildPointBalance
GetPointHistory
CreateParentReward
UpdateParentReward
RequestRewardRedemption
ApproveRewardRedemption
RejectRewardRedemption
MarkRewardFulfilled
CreateManualParentBonus
```

## 15. Invariants

- no duplicate reward for same source event;
- balance cannot become negative through normal redemption;
- only owning parent can approve/reject;
- reward cost > 0;
- automated learning awards store policy version;
- ledger append-only;
- mastered-easy repetition cannot regain full reward by immediately opening a new session.

## 16. Required tests

### Reward engine
- improvement > no improvement under same context;
- weak/developing > mastered for same easy activity;
- repeated mastered sessions decay;
- challenging mastered transfer > easy mastered repeat;
- spaced retention > immediate repeat;
- repeat attempt << first attempt;
- first mastery bonus occurs once.

### Ledger
- source-event idempotency;
- balance reconciliation;
- redemption transaction;
- refund;
- manual parent bonus.

### Authorisation
- another parent cannot inspect/alter rewards or redemptions.

### E2E
- child earns points after eligible learning;
- child requests reward;
- parent approves;
- balance changes once;
- fulfilment status visible.

## 17. Analytics

Track:
- learning points per active child;
- share from improvement/mastery/review/retention;
- share earned on mastered topics;
- reward-decay frequency;
- redemption requests;
- parent approval rate;
- whether nudges lead to useful topic switching.

Do not optimise for total points issued.

Primary learning-oriented question:

**Does the system increase useful practice in weak/relevant outcomes without increasing low-value repetition?**

## 18. Product safety

Avoid:
- random chance rewards;
- paid point purchases;
- loot boxes;
- loss-aversion penalties;
- excessive notification pressure;
- points for endless time in app.

Support a natural stopping point after productive learning.
