# Data Model

## 1. Design principles

1. Stable IDs and immutable versions.
2. Curriculum truth separated from school assessment configuration.
3. Questions separated from question families and question versions.
4. Paper instances freeze exact question versions.
5. Provenance preserved.
6. Parent/child data minimised.
7. Marking/mastery/rewards remain separate bounded contexts.
8. Points use an append-only ledger.

## 2. Identity and child

### `parent_profiles`
Application profile linked to external auth user.

### `children`
Minimal child profile:
- nickname;
- level;
- school;
- academic year.

Do not store NRIC, student ID, exact DOB or home address.

### `schools`
Reference list. School existence does not imply the platform knows its assessment structure.

## 3. Curriculum

### `subjects`
Stable subject records.

### `curriculum_versions`
Version/effective dates for a subject syllabus.

### `source_documents`
Official or parent/school source with provenance.

### `curriculum_domains`
Top-level strand/domain.

### `curriculum_topics`
Topic/subtopic tree.

### `curriculum_outcomes`
Atomic assessable learning outcome or skill.

### `curriculum_outcome_sources`
Evidence linking outcome to source document/page/section.

### `outcome_relationships`
Progression/prerequisite graph.

## 4. Assessments

### `assessments`
Parent-created upcoming assessment.

### `assessment_scope_items`
Confirmed scope at topic/outcome level.

### `assessment_requirements`
Duration, marks, question-format rules or other confirmed requirements.

### `school_assessment_profiles`
Optional structured school-specific official/historical profile.
Every field retains source type/confidence.

## 5. Question bank

### `question_families`
Underlying assessment concept.

### `questions`
Versioned usable question item.

### `question_outcomes`
Maps question to primary/secondary/prerequisite outcomes.

### `question_assets`
Images/SVG/data needed for rendering.

### `question_reviews`
Review audit trail.

Only approved questions are eligible for normal paper generation.

## 6. Blueprint

### `assessment_blueprints`
Versioned paper design.

### `blueprint_scope_items`
Expected marks/coverage for topic/outcome.

### `blueprint_rules`
Question type, difficulty and other constraints.

## 7. Paper

### `papers`
Generated immutable paper instance.

### `paper_questions`
Ordered list referencing exact question versions.

## 8. Digital attempt

### `attempt_sessions`
One child attempt of one paper.

Suggested fields:
- paper;
- child;
- mode (`ipad`, `print_upload`, later other);
- started/submitted time;
- duration;
- state.

### `attempt_responses`
Question-level answer state.

Fields can reference:
- selected option;
- typed answer;
- handwriting object key/vector payload;
- last autosaved time.

## 9. Marking

### `marking_decisions`
Stores:
- response;
- proposed score;
- max score;
- confidence;
- method;
- reason;
- review required;
- final score.

### `marking_reviews`
Human/parent override history.

## 10. Mastery

### `mastery_evidence`
One piece of evidence against an outcome.

Suggested fields:
- child;
- outcome;
- question;
- attempt/practice;
- score ratio;
- difficulty;
- first meaningful attempt;
- question family;
- timestamp.

### `mastery_profiles`
Derived/cached current state per child/outcome.

This is reconstructable from evidence.

## 11. Gamification and rewards

### `reward_policies`
Versioned deterministic reward parameters.

Fields:
- version;
- effective dates;
- status;
- policy JSON;
- change notes.

### `point_ledger`
Authoritative append-only point history.

Fields:
- child;
- amount;
- event type;
- reason code;
- source entity/type;
- source event ID;
- policy version;
- mastery before/after;
- calculation metadata;
- timestamp.

Never edit/delete normal entries. Corrections use compensating entries.

### `child_point_balances`
Optional cached balance. Derived, not authoritative.

### `parent_rewards`
Parent-defined real-world rewards.

Fields:
- parent;
- optional child scope;
- title;
- description;
- cost;
- active;
- limits;
- availability.

### `reward_redemptions`
Child request and parent decision.

States:
- requested;
- approved;
- rejected;
- fulfilled;
- cancelled.

Default deduction occurs on approval.

### `reward_activity_counters`
Optional derived counters for efficient anti-farming evaluation.
Examples:
- rewarded topic sessions in rolling window;
- recent question-family repetitions.

Not source of truth.

## 12. Provenance categories

Curriculum/school:
- `official_moe`;
- `official_seab`;
- `official_school`;
- `parent_provided`;
- `historical_observation`;
- `system_inference`.

Question:
- `original_human`;
- `original_ai`;
- `licensed`;
- `public_domain`;
- `organisation_owned`.

## 13. JSON usage

Use JSONB for flexible metadata only.

Do not hide core relational entities such as outcomes, marks, ownership, question order or ledger entries inside JSON.

Reasonable JSONB uses:
- rendering metadata;
- source extraction metadata;
- answer schema;
- marking scheme;
- reward calculation explanation;
- reward policy parameters.

## 14. Versioning rules

### Curriculum
Never overwrite published historical curriculum.

### Questions
Create a new version after publication/use.

### Blueprint
Create a new version if changed after paper generation.

### Paper
Immutable after generation/attempt.

### Reward policy
New parameters = new policy version.
Ledger entries keep original policy reference.

## 15. Reward idempotency

Every automated reward event must have unique `source_event_id` per child.

Unique constraint prevents retries/jobs from awarding twice.

## 16. Index strategy

Index:
- owner FKs;
- curriculum version + level;
- question approval + subject + level;
- outcome mappings;
- assessment child/date;
- paper assessment/status;
- mastery child/outcome/time;
- point ledger child/time;
- reward redemption child/status.

Add vector search only when there is a proven need.


# UX State and Recommendation Data

Most next-action recommendations should be derived from existing assessment/attempt/mastery state rather than persisted as permanent truth.

If analytics/audit requires persistence, use an event table such as `experience_events` with:
- actor profile/child where appropriate;
- event name;
- entity type/id;
- lightweight metadata;
- timestamp.

Do not store a mutable `current_next_action` as the sole source of truth. Recompute from domain state.

Store user preferences only where they are genuinely durable, for example:
- last selected child;
- accessibility preferences;
- optional exam-mode timer visibility preference if supported.

Do not persist tutorial completion flags for mandatory onboarding because there is no mandatory onboarding flow.
