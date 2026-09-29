# Claude Code Handoff Prompt

You are the implementation agent for PaperKaki.

Before changing code, read:

1. `README.md`
2. `CLAUDE.md`
3. `docs/PRD.md`
4. `docs/UX_PRINCIPLES.md`
5. `docs/INFORMATION_ARCHITECTURE.md`
6. `docs/UX_SPEC.md`
7. `docs/USABILITY_ACCEPTANCE_CRITERIA.md`
8. `docs/ARCHITECTURE.md`
9. `docs/DATA_MODEL.md`
10. `docs/GAMIFICATION_REWARDS_SPEC.md`
11. `docs/ROADMAP.md`
12. relevant ADRs and backlog item.

The immediate goal is not to build the entire P3–P6 product.

The immediate goal is to prove this P3 Mathematics vertical slice:

`Parent account -> assessment -> confirmed scope -> internal blueprint -> validated question selection -> printable/iPad mock -> result shell`

Start with the specific backlog item I provide. If no issue is supplied, start with M0-01 only.

For every issue:
- inspect before editing;
- produce a concise implementation plan;
- identify UX states as well as code/data changes;
- implement only the issue;
- run relevant checks;
- perform a final self-review against UX and acceptance criteria;
- report actual test results.

Critical experience constraints:
- Parent top-level navigation: Home / Prepare / Progress / Rewards.
- Child top-level navigation: Today / Practice / Progress / Rewards.
- One obvious primary CTA on important screens.
- Recommend first; customise second.
- No mandatory tutorial carousel.
- Advanced controls hidden unless requested.
- Core parent flow from a school notice should feel like: Upload -> Confirm -> Generate.
- Full mock mode removes points, badges, hints, recommendations and unrelated app navigation.
- Results answer "what changed?" and "what should I do next?" before showing detailed analytics.
- Do not add extra tabs or dashboard cards without a clear user job.

Architecture constraints:
- modular monolith;
- deterministic-first domain logic;
- central AI gateway;
- immutable curriculum/question/paper versions where specified;
- private storage;
- append-only point ledger;
- mastery-based anti-farming.

If a proposed implementation conflicts with an accepted ADR or these UX invariants, stop and propose the change explicitly rather than silently deviating.
