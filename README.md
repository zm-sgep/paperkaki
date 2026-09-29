# PaperKaki — Claude Code Build Pack v3

PaperKaki is a Singapore primary-school exam preparation product built around one promise:

> **Prepare for your child's actual upcoming school assessment, with almost no setup or guesswork.**

The product combines:

1. verified curriculum;
2. parent-confirmed school assessment scope;
3. realistic mock papers;
4. print and iPad exam modes;
5. marking and learning-gap diagnosis;
6. targeted follow-up practice;
7. mastery-based gamification with anti-farming;
8. a parent-controlled reward catalogue.

## The experience principle

PaperKaki should not feel like a complex education platform.

It should feel like a smart assistant that always makes the **next useful action obvious**.

The family should not need a manual or walkthrough video to complete core tasks.

## First vertical slice

Build **Primary 3 Mathematics** first:

`Parent -> assessment scope -> blueprint -> validated mock -> print/iPad attempt -> result`

Then add:

`marking -> mastery -> targeted practice -> adaptive mock -> mastery-based rewards`

## Read these before coding

1. `CLAUDE.md`
2. `HANDOFF_PROMPT.md`
3. `docs/PRD.md`
4. `docs/UX_PRINCIPLES.md`
5. `docs/INFORMATION_ARCHITECTURE.md`
6. `docs/UX_SPEC.md`
7. `docs/USABILITY_ACCEPTANCE_CRITERIA.md`
8. `docs/UX_RESEARCH_NOTES.md`
9. `docs/ARCHITECTURE.md`
10. `docs/DATA_MODEL.md`
11. `docs/GAMIFICATION_REWARDS_SPEC.md`
12. `docs/ROADMAP.md`
13. relevant ADRs and backlog items.

## Important build rule

Do **not** ask an LLM to generate a complete exam paper directly.

The system must create a structured assessment blueprint, select or generate validated question items, validate the resulting paper, then render it deterministically.

## UX rule

Do not expose internal system concepts such as `Assessment Blueprint`, outcome IDs, reward multipliers, confidence internals, or question-bank structure to ordinary parents or children unless they explicitly open an advanced/admin view.
