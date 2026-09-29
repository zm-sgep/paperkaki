# Information Architecture

## 1. Parent experience

### Primary navigation

#### Home
Question answered: **What matters now?**

Contains:
- selected child;
- upcoming assessment summary;
- current state / readiness summary;
- one recommended next action;
- small recent-progress summary;
- only urgent reward request if relevant.

Home does not need every report.

#### Prepare
Question answered: **What is my child preparing for and what should we do?**

Contains:
- upcoming assessments;
- create assessment;
- upload school notice;
- confirmed scope;
- generated mocks;
- paper settings under `Customise`;
- study/preparation plan.

Sub-routes:
- `/prepare`
- `/prepare/new`
- `/prepare/:assessmentId`
- `/prepare/:assessmentId/scope`
- `/prepare/:assessmentId/mocks`

#### Progress
Question answered: **How is my child learning?**

Contains:
- recent results;
- topic/mastery progress;
- mistakes and patterns;
- progress trend;
- full result detail.

Sub-routes:
- `/progress`
- `/progress/results/:resultId`
- `/progress/topics/:topicId`

#### Rewards
Question answered: **What has my child earned and what can they redeem?**

Contains:
- Learning Points summary;
- point reasons;
- reward catalogue;
- pending requests;
- history.

Sub-routes:
- `/rewards`
- `/rewards/catalogue`
- `/rewards/requests`

### Secondary parent areas

Accessible through profile/settings, not primary navigation:
- children and profiles;
- school information;
- account/security/privacy;
- notifications;
- support/help.

## 2. Child experience

### Today
Question: **What should I do now?**

Contains:
- one recommended mission;
- next assessment context;
- points / nearest reward in a secondary position;
- resume unfinished work.

### Practice
Question: **What else can I practise?**

Contains:
- recommended practice first;
- weak-area practice;
- topic browse if child/parent intentionally wants another area.

### Progress
Question: **What am I getting better at?**

Contains:
- simple mastery map;
- recent mock/practice results;
- achievements;
- review mistakes.

### Rewards
Question: **What have I earned?**

Contains:
- point balance;
- parent reward catalogue;
- reward progress;
- request status.

## 3. Mock Mode

Mock Mode is outside ordinary navigation while active.

Routes such as:
- `/mock/:attemptId/start`
- `/mock/:attemptId/question/:n`
- `/mock/:attemptId/review-submit`
- `/mock/:attemptId/submitted`

Persistent exam chrome only:
- assessment name;
- timer;
- progress;
- question navigator;
- end/submit.

No standard tab bar/sidebar.

## 4. Marked-paper review

Accessible from result detail.

iPad landscape uses a split-view pattern:
- dominant paper surface;
- narrower feedback panel;
- question navigator.

On smaller screens, feedback becomes a sheet/stacked screen.

## 5. Admin experience

Admin is separate from parent/child information architecture.

Possible admin destinations:
- Curriculum
- Question Bank
- Reviews
- Papers/Generation QA
- Quality
- Sources

Admin complexity must not leak into family UX.

## 6. Responsive navigation

### Phone
Use four persistent bottom tabs.

### iPad
Prefer the same four conceptual destinations. A tab interface can adapt to a sidebar where appropriate, but the information architecture remains unchanged.

### Desktop/web
Use the same four destinations. Do not introduce extra destinations just because horizontal space exists.

## 7. Deep-link principle

Notifications and recommended actions should open the exact task, not a generic dashboard.

Examples:
- marking review notification -> uncertain question;
- reward request -> specific request;
- mock ready -> mock detail/start;
- scope extraction ready -> confirmation screen.
