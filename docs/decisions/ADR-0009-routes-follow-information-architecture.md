# ADR-0009: App Routes Follow the Information Architecture

## Status
Accepted (2026-09-29)

## Context
`docs/ARCHITECTURE.md` section 4 lists route folders `dashboard/`, `children/`, `assessments/`, `papers/`, `results/`. These match the early dashboard concept, not ADR-0007. `docs/INFORMATION_ARCHITECTURE.md` defines the family routes. Several backlog items still use the older wording.

## Decision
1. Family routes follow `docs/INFORMATION_ARCHITECTURE.md`:
   - parent: `/home`, `/prepare`, `/progress`, `/rewards`; account, children and settings under `/account`;
   - child (later): `/today`, `/practice`, `/progress`, `/rewards` inside a separate child layout;
   - mock (later): `/mock/:attemptId/...` in an isolated layout with no family navigation;
   - admin: `/admin/...`, separate layout and navigation.
2. Domain modules are those in `CLAUDE.md`, which adds `attempts` and `recommendations` to the list in `ARCHITECTURE.md`.
3. M0-04 ("dashboard shell") is delivered as UX-01, the four-destination parent shell. The M0 exit reads "a parent can sign in and reach Home".
4. M3-07 ("parent blueprint review screen") is delivered as UX_SPEC screen C, "Your mock is ready to create", with paper settings under `Customise paper`. There is no blueprint screen in the ordinary path.
5. PRD section 16 ("Parent dashboard") and the blueprint steps in PRD sections 4 and 19 are read through ADR-0008 and the PRD's own "UX Simplification Requirements": the blueprint is built internally, and Home shows one next action.

## Consequences
Route names and user-facing words match what parents see. Folder names do not create pressure to add navigation destinations.
