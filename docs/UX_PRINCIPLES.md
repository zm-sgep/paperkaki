# PaperKaki UX Principles

## North star

PaperKaki should feel like a good tutor quietly telling the family:

> **This is what you should do next.**

The system can be sophisticated. The experience should not feel sophisticated.

## 1. One useful next action

Every major landing screen has one primary action.

Examples:
- Add assessment
- Confirm scope
- Generate mock
- Continue mock
- Review mistakes
- Start recommended practice
- Generate next mock
- Request reward

Secondary actions must not visually compete with the primary action.

## 2. Recommend first, customise second

The system proposes a sensible default using known data.

Normal case:

`Recommended mock: 40 marks · 45 min · based on confirmed school scope -> Generate`

Advanced users may open `Customise`.

Do not make every parent design an assessment from scratch.

## 3. Four primary destinations maximum

### Parent
- Home
- Prepare
- Progress
- Rewards

### Child
- Today
- Practice
- Progress
- Rewards

Admin is separate.

Do not add primary tabs for Children, Papers, Results, School Info, Question Bank or Settings. Put these within the correct destination or profile/admin surfaces.

## 4. State-driven Home

Home is not a wall of charts. It decides what matters now.

Possible parent Home states:

| State | Primary action |
|---|---|
| No upcoming assessment | Add assessment |
| Uploaded notice awaiting confirmation | Confirm scope |
| Scope confirmed, no mock | Generate first mock |
| Mock ready | Start / Print mock |
| Mock unfinished | Continue mock |
| Submitted | Marking in progress |
| Results ready | See what needs work |
| Mistakes unreviewed | Review mistakes |
| Weak area identified | Start targeted practice |
| Enough practice completed | Generate next mock |
| Exam close | Do final mock |
| Productive plan complete | Done for today |

Child Today uses the same principle and shows one mission.

## 5. Progressive disclosure

Primary screens show only frequent decisions.

Hide by default:
- difficulty percentages;
- detailed mark allocation;
- question-type mix;
- learning outcome codes;
- historical school inference details;
- AI confidence numbers;
- reward multipliers;
- curriculum provenance.

Expose these only in advanced/admin/review surfaces where relevant.

## 6. Recognition over recall

Do not require users to remember information from prior screens.

Examples:
- keep child + assessment context visible in multi-step flows;
- show extracted scope next to confirmation;
- keep progress state visible during exam;
- show original child answer beside feedback;
- preserve last-selected child and subject;
- resume unfinished activities.

## 7. Contextual teaching, not tutorials

No mandatory seven-page onboarding.

Teach at the point of action:
- first scan: explain how to photograph a page;
- uncertain marking: explain why parent review is requested;
- first reward request: explain parent approval;
- first Pencil attempt: show a lightweight in-context tip if needed.

Help may exist, but core tasks should not depend on it.

## 8. Parent and child are separate products

### Parent job
Prepare, understand, guide, approve.

### Child job
Do, learn, improve, earn.

Do not reuse dense parent analytics in the child interface.

## 9. Exam Mode is sacred

Full Mock Mode removes:
- points;
- badge progress;
- reward catalogue;
- immediate correctness;
- hints;
- recommendations;
- unrelated app navigation.

Show only what supports sitting the mock:
- paper;
- timer;
- progress;
- answer/working tools;
- navigation;
- submit/end controls.

Practice Mode may include hints and immediate feedback.

## 10. Results are action-oriented

Top of results answers:
1. How did I do?
2. What changed?
3. What should I do next?

Detailed analytics are secondary.

Parent example:

`31/40 · Fractions improved · Length still needs attention -> Start 15-minute Length practice`

Child example:

`Great effort. Let's fix 3 important mistakes -> Review mistakes`

## 11. Marked paper should feel familiar

On iPad landscape:
- paper occupies most of screen;
- feedback panel appears alongside/on demand;
- annotations and marks resemble a returned paper;
- tap error to see concise explanation and worked solution;
- prioritise the few mistakes worth learning from.

## 12. Gamification supports learning

Points are visible before/after learning, not during a full mock.

Child does not see anti-farming mechanics. The system simply redirects:

`You're already strong in Multiplication. Try Fractions next to earn more points and keep growing.`

## 13. Familiar words

Parent-facing language:
- Upcoming assessment
- Topics
- Mock paper
- Practice
- Results
- What to work on next

Avoid:
- blueprint
- AO/LO IDs
- mastery-evidence vectors
- inference confidence
- reward multiplier

## 14. Accessibility is normal UX

- minimum practical touch target follows platform guidance;
- sufficient spacing;
- colour is never the only status indicator;
- icons have labels where meaning is not universal;
- text remains legible;
- Pencil and finger controls are forgiving;
- important actions have clear press/loading/success states.

## 15. Design for natural stopping

The app must be allowed to say:

> **You're done for today.**

Do not create endless feeds or infinite reward loops for children.
