# UX Research Notes and Product Implications

Research checked in September 2026. This document records product patterns, not instructions to copy another product visually.

## 1. Apple Human Interface Guidelines — Onboarding

Source:
https://developer.apple.com/design/human-interface-guidelines/onboarding

Relevant pattern:
- users should ideally understand an app through use;
- onboarding, if needed, should be quick and optional;
- teach through interaction and context-specific tips;
- postpone nonessential setup and use reasonable defaults.

PaperKaki implication:
- no mandatory tutorial carousel;
- show help at first scan/mark/reward action;
- use recommended defaults and `Customise` for exceptions.

## 2. Apple HIG — Tab bars and sidebars

Sources:
https://developer.apple.com/design/human-interface-guidelines/tab-bars
https://developer.apple.com/design/human-interface-guidelines/sidebars

Relevant pattern:
- tab bars support top-level navigation and preserve section state;
- Apple recommends preferring a tab bar for many top-level iPad experiences, with adaptable sidebar behaviour when appropriate;
- keep the top-level set small and meaningful.

PaperKaki implication:
- parent and child each have four conceptual destinations;
- phone uses four bottom tabs;
- iPad may adapt them into a sidebar without changing information architecture;
- desktop does not gain extra tabs merely because space exists.

## 3. Apple HIG — Accessibility / controls

Sources:
https://developer.apple.com/design/human-interface-guidelines/accessibility
https://developer.apple.com/design/human-interface-guidelines/buttons

Relevant pattern:
- generous hit regions and spacing reduce accidental taps;
- prominent visual treatment should correspond to the most likely action.

PaperKaki implication:
- child exam controls are large and forgiving;
- one visually dominant action per task screen;
- iPad Pencil/touch tools need spacing and visible states.

## 4. Nielsen Norman Group — Progressive disclosure

Source:
https://www.nngroup.com/articles/progressive-disclosure/

Relevant pattern:
- show important/frequent options first;
- defer advanced/rare options to secondary surfaces;
- this improves learnability and reduces errors.

PaperKaki implication:
- recommended mock is the default;
- detailed difficulty/question-mix controls live under `Customise`;
- normal parents do not interact with internal blueprint concepts.

## 5. Nielsen Norman Group — Recognition rather than recall

Sources:
https://www.nngroup.com/articles/ten-usability-heuristics/
https://www.nngroup.com/videos/recognition-vs-recall/

Relevant pattern:
- reduce memory burden by keeping relevant actions/options/context visible.

PaperKaki implication:
- preserve child/assessment context through setup;
- show extracted school scope while confirming it;
- show original answer beside feedback;
- remember/resume unfinished mock state.

## 6. Atom Learning — exam-specific mock workflow

Sources:
https://www.atomlearning.com/features/mock-tests
https://www.atomlearning.com/features/paper-tests

Relevant product pattern:
- tailored practice papers by target exam/school;
- fresh papers;
- photo upload for paper marking;
- immediate breakdown of strengths and gaps;
- exam-like timing/format.

PaperKaki implication:
- strong validation for the school-specific exam-prep proposition;
- keep the user journey exam-centred rather than content-library-centred;
- paper -> upload -> result -> focus next is a coherent loop.

Caution:
PaperKaki must only claim school specificity to the extent supported by confirmed/current school information.

## 7. SplashLearn — Today's Recommendation

Source:
https://support.splashlearn.com/hc/en-us/articles/12275140049298-How-can-parents-set-an-active-topic-or-change-the-focus-area-for-learning-path

Relevant pattern:
- parent can enter a recommended learning path directly;
- focus area is editable when the parent wants more control.

PaperKaki implication:
- recommendation is the default action;
- custom topic selection remains available but secondary.

## 8. IXL — personalised recommendations and streamlined student navigation

Source:
https://blog.ixl.com/2026/08/26/tour-the-latest-ixl-app/

Relevant pattern:
- student dashboard exposes personalised recommendations and fast access to relevant learning;
- navigation is designed to reduce the effort of finding what to practise.

PaperKaki implication:
- child Today should surface one recommended mission;
- curriculum browsing belongs below recommendations.

## 9. Seneca — compact parent home

Source:
https://help.senecalearning.com/en/articles/8315278-how-do-i-use-the-parent-platform

Relevant pattern:
- parent home concentrates on upcoming work, recent activity and weekly plan;
- child selector sits at the top.

PaperKaki implication:
- parent Home should answer what is next at a glance;
- detailed reports belong in Progress rather than filling Home.

## 10. Khan Academy — parent dashboard patterns

Sources:
https://support.khanacademy.org/hc/en-us/articles/360039664491-What-can-I-do-from-the-Khan-Academy-Parent-Dashboard
https://support.khanacademy.org/hc/en-us/articles/360040168512-Parent-Quick-Start-Guide

Relevant pattern:
- parent has a clear hub for child management, assignments and progress;
- children can be selected and drilled into;
- activity/settings/reporting are separated.

PaperKaki implication:
- child switching is a selector rather than a primary feature area;
- parent Home remains a hub, while Prepare and Progress separate doing from analysis.

## Research synthesis

The recurring pattern across strong products and general UX guidance is:

**Recommend first -> expose detail on demand -> preserve context -> keep navigation small -> make next action obvious.**

PaperKaki should differentiate by applying this specifically to the school-assessment loop:

`Upload/enter scope -> confirm -> generate -> attempt -> mark -> understand -> next action`
