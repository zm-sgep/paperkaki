# UX Specification — Parent and Child

## 1. Experience goal

A new parent should be able to prepare a child from a school assessment notice without training.

A primary-school child should be able to start and complete an iPad mock without asking what to press next.

The interface should feel calm, direct and forgiving.

---

# 2. Parent Home

## Default layout

Top:
- child selector;
- child level/school;
- optional subject context only where relevant;
- profile/notifications.

Hero:
- one state-driven card;
- one primary CTA.

Examples:

### No assessment
**What is Darius preparing for?**
`[Add upcoming assessment]`

### Scope awaiting confirmation
**We read the WA3 notice. Please check 4 topics.**
`[Confirm scope]`

### Mock ready
**Mathematics WA3 · Mock 1 is ready**
`[Start / Print mock]`

### Results ready
**31/40 · Fractions improved; Length needs more work**
`[See what to work on]`

Below hero, show only compact supporting context:
- upcoming assessment;
- progress snapshot;
- recent result;
- pending reward request if applicable.

Do not show more than needed to decide the next action.

---

# 3. Parent assessment setup

The technical sequence is:
`assessment -> extraction -> scope -> blueprint -> paper`.

The parent experience is:

## Screen A — What are you preparing for?
Fields:
- child;
- subject;
- assessment name/type;
- date.

Primary action:
`[Upload school notice]`

Secondary:
`Enter details myself`

## Screen B — We found this
Show extracted information in plain language:
- assessment/date;
- duration if found;
- topics;
- format if found.

Confidence is represented as:
- normal confirmed-looking content where strong;
- `Please check` beside uncertain items.

Do not show raw confidence decimals.

Primary CTA:
`[Looks right]`

Secondary:
`Edit`

## Screen C — Your mock is ready to create
Show:
- subject;
- marks/duration if known/recommended;
- topic list;
- one sentence explaining the mock will cover all topics and adapt later based on performance.

Primary CTA:
`[Generate first mock]`

Secondary disclosure:
`Customise paper`

Normal users should not need the blueprint screen.

---

# 4. Parent Prepare

Show upcoming assessment cards ordered by urgency.

Each card should communicate:
- subject + assessment;
- date/countdown;
- setup state;
- most useful action.

Examples:
- `Needs scope -> Add notice`
- `Scope confirmed -> Generate mock`
- `Mock ready -> Start/Print`
- `Practice in progress -> Continue plan`

Generated paper history lives inside the assessment, not as a separate primary Papers tab.

---

# 5. Parent Progress

Top:
- one sentence summary;
- most useful next action.

Example:

**Fractions improved. Length word problems still need attention.**
`[Start 15-minute Length practice]`

Then progressive detail:
- topic performance;
- recent mocks;
- trend;
- mistake patterns;
- curriculum/learning outcomes under `Detailed breakdown`.

Do not open with a wall of metrics.

---

# 6. Parent Rewards

Show:
- child point balance;
- points earned this week;
- top reasons;
- pending requests;
- reward catalogue.

The parent can:
- create/edit/retire reward;
- approve/reject request;
- mark fulfilled;
- give manual bonus with reason.

Learning-earned points and manual bonuses are visibly distinct.

---

# 7. Child Today

Top hero:

**Hi Darius 👋**

**Your next mission**
Fractions + Length · about 15 min
`[Start]`

Secondary information:
- next assessment countdown;
- points and nearest reward;
- simple mastery/progress strip.

If a mock is due, mock becomes the mission.

If nothing productive remains:

**You're done for today. Nice work.**

---

# 8. Child Practice

Default order:
1. Recommended for you.
2. Mistakes to fix.
3. Weak/developing assessment topics.
4. Browse other topics.

Avoid presenting a huge curriculum grid immediately.

Practice Mode can show:
- hints;
- check answer;
- immediate feedback;
- points after meaningful activity;
- retry/similar question.

---

# 9. Pre-mock

Show only:
- assessment name;
- mock number;
- marks;
- duration;
- question/page count;
- short instructions;
- clear Start button.

Tone is calm.

Do not show points/reward offers immediately before start.

---

# 10. iPad Mock Mode

## Landscape preferred layout

Header:
- `Mathematics WA3 · Mock 2`
- progress;
- timer;
- End/Submit.

Main:
- large paper-like question surface;
- handwriting/working space;
- minimal drawing controls;
- previous/next;
- optional question/page navigator.

### Inputs
- Apple Pencil/finger working;
- MCQ selection;
- numeric/short typed response where suitable;
- eraser;
- undo/redo;
- clear.

### Behaviour
- autosave locally/server as appropriate;
- preserve work across accidental navigation;
- unanswered indicators;
- submit review listing unanswered items;
- confirmation before final submit;
- no correctness feedback;
- no hints;
- no gamification;
- no normal app tabs/sidebar.

### Accessibility/usability
- frequent touch controls at least platform-recommended hit size;
- adequate spacing;
- controls reachable and visually distinct;
- Pencil strokes never obscured by toolbars;
- timer not excessively alarming until meaningful thresholds.

---

# 11. Print-paper upload

Flow:
1. Take/upload pages.
2. Auto-detect/order pages.
3. Show thumbnail grid.
4. Flag only problem pages.
5. Primary CTA: `Submit for marking`.

Problem states:
- blurry;
- missing page;
- wrong orientation;
- incomplete crop.

Tell user exactly what to fix.

---

# 12. Marking progress

Use a reassuring simple state:
- Uploading paper ✓
- Reading answers
- Marking questions
- Preparing results

Avoid fake countdowns or fabricated precise completion time.

---

# 13. Marked-paper review

## iPad landscape

Approximately:
- 65–70% paper;
- 30–35% feedback panel.

Paper shows:
- original question;
- original working/answer;
- mark;
- simple annotations.

Feedback panel shows:
- what happened;
- concise explanation;
- worked solution;
- `Try one like this` after review.

Prioritise a small number of meaningful errors first.

Correct questions can be browsed but should not dominate review.

---

# 14. Results

## Child results
Order:
1. score;
2. encouraging summary;
3. 1–3 important things to learn;
4. review mistakes;
5. points earned after review/learning where policy allows;
6. next practice.

## Parent results
Order:
1. score/result;
2. what changed;
3. what needs attention;
4. recommended next action;
5. topic breakdown;
6. detailed analytics.

Readiness must be labelled as demonstrated preparation/mastery, not a predicted exam score.

---

# 15. Gamification UX

Learning Points are shown:
- child Today;
- after completed meaningful learning;
- Rewards.

Not shown:
- during full Mock Mode.

After a high-value activity:

`+14 Learning Points · You improved in Fractions and reviewed two mistakes.`

After mastered-topic repetition:

`You're already strong here. Try Fractions next to earn more points and keep growing.`

Do not expose anti-farming formulas.

---

# 16. Empty, loading and error states

Every state should answer:
- what happened;
- whether the user's work is safe;
- what to do next.

Examples:

**We couldn't read page 3 clearly.**
Your other pages are saved.
`[Retake page 3]`

**We need a quick check on Question 8.**
The handwriting could mean two different answers.
`[Review Question 8]`

---

# 17. Help strategy

No mandatory onboarding.

Support hierarchy:
1. self-explanatory design;
2. contextual microcopy;
3. optional tip on first encounter;
4. searchable Help/FAQ;
5. support contact.

Core flows must not require watching a video.
