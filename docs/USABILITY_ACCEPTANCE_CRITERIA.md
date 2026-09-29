# Usability Acceptance Criteria

These criteria are product gates, not aspirational notes.

## 1. Navigation constraints

- Parent ordinary experience has no more than 4 primary destinations.
- Child ordinary experience has no more than 4 primary destinations.
- Settings/profile is not a primary destination.
- Admin navigation is isolated from family navigation.
- Active destination remains visible/persistent in normal app mode.

## 2. Primary-action constraints

- Every major task screen has exactly one visually dominant primary CTA.
- Secondary actions use lower visual prominence.
- Destructive actions are clearly differentiated and require appropriate confirmation.

## 3. Core flow targets

### Parent
- Home -> current recommended action: **1 tap**.
- Add assessment from school notice -> confirmed scope: **<= 3 meaningful screens** after selecting/photographing the notice.
- Confirmed scope -> generate recommended mock: **1 primary action**.
- Results -> recommended follow-up: **1 tap**.
- Approve reward request: **1 tap + confirmation** where appropriate.

### Child
- Today -> recommended activity: **1 tap**.
- Resume unfinished mock: **1 tap**.
- Results -> mistake review: **1 tap**.
- Request available parent reward: **<= 2 taps**.

## 4. Tutorial constraint

- Mandatory tutorial screens for core flows: **0**.
- Mandatory how-to video: **0**.
- First-use tips must be contextual and dismissible.

## 5. Progressive-disclosure constraint

The following must not appear in the default parent setup path unless needed:
- difficulty percentages;
- question mix configuration;
- curriculum outcome IDs;
- extraction confidence numbers;
- historical model/inference detail;
- reward multipliers.

Advanced settings are reachable but not in the path of the recommended default.

## 6. Mock Mode constraints

During full mock:
- standard app navigation hidden;
- no points/rewards/badges;
- no immediate correctness feedback;
- no hints unless explicitly in Practice Mode;
- answer state autosaves;
- unanswered items are visible before submission;
- final submission has confirmation.

## 7. Accessibility baseline

- use platform-recommended target sizes and adequate spacing for frequent controls;
- colour is never the only status cue;
- focus/keyboard navigation works on web where relevant;
- text supports reasonable scaling;
- icons without universally obvious meaning include labels/tooltips/accessibility labels;
- loading and disabled states are perceivable.

## 8. Error recovery

For upload, extraction and marking failures:
- tell user exactly what needs attention;
- preserve unaffected work;
- provide one obvious recovery action;
- never make the user restart the entire flow for one bad page/question where avoidable.

## 9. Content language

Parent/child default UI must not use unexplained internal terms such as:
- blueprint;
- LO/AO IDs;
- embedding/vector;
- confidence 0.83;
- policy multiplier;
- OCR pipeline.

## 10. Usability study gates

Before public beta, run task-based tests with people who have not seen the product.

### Parent tasks
Give the parent a sample school assessment notice and ask only:

> Prepare your child for this assessment.

Measure:
- completion without help;
- wrong turns;
- hesitation;
- time to first mock;
- questions asked.

Target for core setup:
- at least **80% unassisted completion** in early beta testing;
- improve toward **90%+** before wider launch.

### Child tasks
Ask a P3/P4 child:

> Do this mock paper.

Measure:
- whether child can start unaided;
- navigation mistakes;
- accidental submits;
- unanswered-question discovery;
- ability to review mistakes after result.

### Red flag
If multiple test participants ask, "What do I press now?" at the same screen, treat it as a design defect.

## 11. Analytics to instrument

Track flow health, not just feature usage:
- Home recommended-action click-through;
- assessment setup completion;
- scope correction rate;
- customise-paper usage rate;
- generation abandonment;
- mock resume rate;
- unanswered-at-submit rate;
- review-mistakes completion;
- recommended-next-step acceptance;
- support/help opens during core flows.

A high Help-open rate on a core flow is a usability warning, not a success metric.
