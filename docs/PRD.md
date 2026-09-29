# PaperKaki Product Requirements Document

## 1. Product vision

PaperKaki helps Singapore parents prepare their children for the child's **actual upcoming school assessment**, rather than generic level-based practice.

The product combines three layers:

1. MOE curriculum truth.
2. Parent-confirmed school assessment requirement.
3. The child's demonstrated learning profile.

The long-term learning loop is:

`School assessment -> Understand scope -> Generate mock -> Attempt -> Mark -> Diagnose -> Targeted practice -> Next mock`

The motivation loop is:

`Meaningful learning -> Improvement/mastery -> Learning Points -> Parent reward -> Next useful learning activity`

## 2. Initial target

MVP vertical slice:
- Singapore;
- Primary 3;
- Mathematics;
- parent/guardian account;
- printable paper and iPad attempt modes;
- no generic “AI worksheet generator” positioning.

## 3. Core proposition

The product is not primarily:

> Generate AI worksheets.

It is:

> Prepare specifically for your child's next school assessment.

## 4. Main parent journey

1. Sign up.
2. Add a child nickname, level, school and subjects.
3. Create an upcoming assessment.
4. Enter or upload the assessment scope.
5. Confirm interpreted topics/outcomes.
6. Generate an assessment blueprint.
7. Generate a validated mock paper.
8. Choose print mode or iPad mode.
9. Child completes the paper.
10. Upload/submit answers.
11. System marks and identifies uncertainty.
12. Parent/child reviews results.
13. System diagnoses learning gaps.
14. Child completes targeted practice.
15. System generates another mock adapted to weaknesses while keeping assessment coverage representative.

## 5. Product principles

### 5.1 Curriculum-first
Every question must map to verified curriculum outcomes.

### 5.2 School-specific, not school-predictive
Use confirmed requirements. Historical patterns may inform suggestions, never guarantees.

### 5.3 Parent-controlled
Parents can inspect and edit scope, marks, duration, paper settings and rewards.

### 5.4 Child-friendly
The child flow must reduce cognitive overhead and feel like a calm assessment environment.

### 5.5 Printable and iPad-compatible
Maths and Science must work well on paper. The iPad mode should simulate exam conditions without turning the experience into a game during the assessment itself.

### 5.6 Confidence-aware
Uncertain extraction or marking must be surfaced.

### 5.7 Explain, not merely score
Future marking should diagnose topic/outcome and likely error type.

### 5.8 Mastery-first gamification
Points reward learning progress, not raw question volume.

## 6. Assessment scope input

Support:
- manual topic/outcome selection;
- PDF/photo/screenshot upload;
- suggested scope clearly labelled as a suggestion.

Preserve:
- original parent/school text;
- mapped curriculum;
- mapping confidence;
- source/provenance.

## 7. Assessment blueprint

A blueprint is the contract for a generated paper.

It includes:
- level;
- subject;
- assessment type;
- duration;
- total marks;
- selected outcomes/topics;
- marks allocation;
- question-type distribution;
- target difficulty distribution;
- optional school-format rules.

Priority:
1. parent-confirmed requirements;
2. explicit school requirements;
3. current curriculum rules;
4. existing school template;
5. child learning profile;
6. general historical patterns.

## 8. Question model

Each question must include:
- stable ID;
- family ID;
- version;
- status;
- subject/level;
- primary outcome;
- optional secondary outcomes;
- prerequisites;
- question type;
- response type;
- cognitive demand;
- difficulty;
- marks;
- estimated time;
- prompt/stimulus;
- answer;
- worked solution;
- marking scheme;
- provenance;
- review history.

Question concept/family must be separated from individual variants.

## 9. Question quality gate

Before a question can be used in a generated paper:
- curriculum alignment confirmed;
- correct answer exists;
- independent answer verification passes;
- question is answerable and age-appropriate;
- marks are coherent;
- required assets exist;
- approval state permits use.

## 10. Paper generation

Never ask an AI model to create the final paper directly.

Flow:

`Blueprint -> Candidate questions -> Constraint solver/selector -> Validate -> Freeze paper version -> Render`

Once attempted, a paper is immutable.

## 11. Assessment attempt modes

### 11.1 Print mode
Parent prints the student PDF. Child writes normally. Parent later scans/uploads the paper.

### 11.2 iPad mode
The iPad experience should feel like a digital exam paper:
- question navigator;
- timer;
- progress indicator;
- handwriting canvas with Apple Pencil support;
- eraser/undo;
- optional scratch/working area;
- autosave;
- clear submit confirmation.

During an active mock, avoid points, badges, reward progress or distracting animations.
Gamification appears before or after the assessment, not inside the exam attempt.

## 12. Paper outputs

Student paper:
- A4;
- name/date area;
- duration;
- total marks;
- instructions;
- questions;
- adequate working space;
- page numbers.

Parent pack:
- answer key;
- worked solutions;
- marks;
- curriculum mapping.

Answers must not leak into the student paper.

## 13. Marking

Marking categories:
- deterministic;
- rubric/AI assisted;
- human review recommended.

Every marking decision stores:
- proposed score;
- max score;
- confidence;
- method;
- reason;
- review-required flag;
- parent override if any.

## 14. Mastery

Track evidence at curriculum-outcome level.

Suggested states:
- not started;
- learning;
- developing;
- almost mastered;
- mastered;
- retained.

Do not infer mastery from one question or one session.

Use repeated evidence across:
- sessions;
- question families;
- question types;
- difficulty;
- time.

## 15. Child gamification and parent rewards

### 15.1 Purpose

Gamification should motivate the child to continue learning while preventing the system from rewarding repetitive low-value activity.

Central principle:

**Earn more when you grow, not when you grind.**

Reward:
- meaningful attempts;
- improvement;
- first-time mastery;
- recovery of weak areas;
- review of mistakes;
- spaced retention;
- healthy topic variety;
- appropriate challenge.

Do not primarily reward:
- raw question count;
- time spent;
- repeated easy questions;
- repeated retries;
- guessing;
- farming mastered topics.

### 15.2 Learning Points

Use one simple child-facing currency: **Learning Points**.

The child sees:
- current point balance;
- points earned after meaningful activities;
- progress toward parent-defined rewards;
- why points were earned.

Internally preserve reason categories:
- completion;
- improvement;
- mastery;
- mistake review;
- retention;
- exploration/variety;
- challenge.

### 15.3 Mastery rewards

First-time mastery can provide a meaningful one-off bonus.

Mastery must be evidence-based.

After mastery, reward yield must fall substantially for repeated low-challenge practice.

### 15.4 Diminishing returns

After mastery:

**Same topic, same/easier difficulty**  
Very low reward.

**Same topic, harder application/transfer**  
Moderate reward can remain.

**Spaced review after an appropriate interval**  
Moderate retention reward can return.

**Weak/developing topic**  
Higher reward potential.

### 15.5 Anti-farming controls

1. First-attempt weighting.
2. Question-family repetition penalty.
3. Topic saturation decay.
4. Difficulty floor after mastery.
5. Mistake-review requirements for some recovery rewards.
6. Variety boost for relevant under-practised outcomes.
7. Rapid-guess protection only where evidence is reliable.
8. Cooldown/diminishing return for near-identical repeated activities.

### 15.6 Child nudging

When reward yield drops, redirect constructively.

Examples:
- “Great job. You've mastered this skill.”
- “You're already strong here. Try a new challenge to keep growing.”
- “You can earn more points by working on Fractions next.”
- “You remembered this after a break. That's strong learning.”

Avoid shame, punishment or ability labels.

### 15.7 Badges and celebrations

Optional recognition:
- mastery badge;
- improvement badge;
- review badge;
- retention badge;
- variety/exploration badge.

Badges do not replace mastery evidence.

### 15.8 Streaks

Do not make a simple daily streak the primary mechanic.

Prefer:
- learning streak;
- mistake-review streak;
- improvement streak;
- variety streak.

A missed day should not erase meaningful progress.

### 15.9 Parent-defined rewards

Parents can create rewards with:
- name;
- description;
- point cost;
- optional icon/image;
- optional quantity or redemption limit;
- optional availability dates;
- active/inactive state.

The platform does not promise or fulfil the reward. The parent does.

### 15.10 Redemption

Default flow:
1. Child requests a reward.
2. System checks available balance.
3. Parent receives request.
4. Parent approves or rejects.
5. On approval, points are deducted transactionally.
6. Parent later marks it fulfilled.

### 15.11 Parent reward dashboard

Show:
- total points earned this week;
- points by reason;
- points by subject/topic;
- mastery bonuses;
- reward requests;
- reward history;
- useful anti-farming insights.

Separate learning-earned points from manual parent bonuses.

### 15.12 Reward transparency

Every automated point event stores:
- child;
- source activity;
- amount;
- reason code;
- mastery before/after;
- policy version;
- multipliers/adjustments;
- anti-farming decisions;
- timestamp.

### 15.13 Reward formula

Use a deterministic rules engine.

Conceptually:

`points = base × accuracy × improvement × mastery_need × difficulty × variety × anti_farming`

The exact implementation may differ, but all numeric constants must live in one versioned reward policy.

### 15.14 Safety

Do not use:
- gambling-like random rewards;
- paid loot boxes;
- paid point purchases for children;
- punitive loss mechanics;
- endless points for screen time;
- manipulative notifications.

The system should support a natural stopping point after productive learning.

## 16. Parent dashboard

Parent dashboard should prioritise decisions, not raw analytics.

Top section:
- child selector;
- next assessment;
- readiness indicator;
- recommended next action;
- generate mock / upload completed paper.

Learning section:
- topic performance;
- learning outcomes;
- curriculum coverage for upcoming assessment;
- recent mock papers;
- score trend;
- mistake patterns;
- next two-week plan.

Rewards section:
- Learning Points earned this week;
- why they were earned;
- available/pending rewards;
- low-yield mastered-topic activity if notable.

Do not show a “predicted exam score” as fact.

## 17. Child home/dashboard

Child view should be simpler than parent view.

Show:
- next mock/practice;
- mastery progress;
- Learning Points balance;
- nearest parent reward;
- one recommended next action;
- recent celebration/achievement.

Do not expose complex curriculum codes, analytics or parent controls.

## 18. Privacy baseline

Collect minimal child data.

Do not require:
- NRIC;
- student ID;
- exact DOB;
- home address.

Parent/guardian is the account holder.

Private files use private object storage and signed URLs.

## 19. MVP success for Milestones 0–4

A parent can:
1. create account;
2. add P3 child;
3. create P3 Maths assessment;
4. choose curriculum scope manually;
5. create/confirm blueprint;
6. generate a valid printable mock;
7. obtain a separate answer/solution pack.

The paper must have correct marks, scope, question numbering and answers.

## 20. Explicitly not in Milestones 0–4

- OCR/school-notice extraction;
- handwriting marking;
- mastery model;
- adaptive practice;
- gamification;
- other subjects;
- subscriptions;
- tutor/teacher accounts;
- exam-score prediction.


# UX Simplification Requirements

## Product experience statement

PaperKaki must be usable by ordinary parents and primary-school children without a manual or training video. The application should make the next useful action obvious and defer complexity until requested.

## Primary navigation

Parent: **Home / Prepare / Progress / Rewards**.

Child: **Today / Practice / Progress / Rewards**.

Do not add extra ordinary-user primary destinations without revising the accepted information architecture ADR.

## Parent Home

Home is state-driven rather than dashboard-driven. It should prioritise one action based on current state. Supporting cards are secondary.

## Parent preparation flow

For the common case, the visible flow should be approximately:

`Upload school notice -> Confirm what was found -> Generate recommended mock`

The internal assessment blueprint remains hidden unless the parent selects advanced customisation.

## Child Today

Show one mission. Do not make the child choose from the entire curriculum before seeing the recommended task.

## Exam Mode

A full mock must visually and behaviourally separate itself from normal app mode. Hide ordinary navigation, hints, instant marking and gamification until submission.

## Result hierarchy

Before detailed analytics, state:
1. result;
2. what changed;
3. what needs work;
4. recommended next step.

## Onboarding

There must be no mandatory tutorial carousel for the standard parent or child flow. Use contextual guidance only where necessary.

## Usability release gate

Core tasks must satisfy `docs/USABILITY_ACCEPTANCE_CRITERIA.md`. A feature can be functionally complete but still fail release if the ordinary flow violates those criteria.
