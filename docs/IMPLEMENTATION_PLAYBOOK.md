# Coding Project Management Playbook

## 1. Source of truth

Use:
- GitHub repository for code/docs;
- GitHub Issues for work items;
- GitHub Project board for status;
- PRD/ADRs in repository for durable decisions.

Avoid keeping important architectural decisions only in chat history.

## 2. Suggested board columns

- Inbox
- Ready
- In Progress
- In Review
- QA
- Done
- Blocked

Limit "In Progress" to 1–2 issues while building solo.

## 3. Issue size

Aim for one Claude Code working session per issue.

Good:
- Add curriculum outcome schema.
- Build blueprint validation for total marks.
- Render student paper header.

Too large:
- Build curriculum system.
- Build PDF generator.
- Implement AI.

Split until acceptance criteria can be tested clearly.

## 4. Definition of Ready

An issue is Ready when it has:
- user/business purpose;
- explicit scope;
- acceptance criteria;
- dependencies;
- non-goals;
- data/API impact if known.

## 5. Session workflow with Claude Code

Use this pattern:

1. Give Claude the issue number/title.
2. Tell it to read PRD, architecture, data model and relevant ADRs.
3. Ask it to inspect current code.
4. Ask for an implementation plan before substantial edits.
5. Let it implement.
6. Require test execution.
7. Ask for a self-review of the diff against acceptance criteria.
8. Manually test the main path.
9. Commit.
10. Move issue to Done only after acceptance criteria pass.

## 6. Branch strategy

For solo development:
- `main` is deployable;
- one branch per meaningful issue.

Examples:
- `feature/m1-03-curriculum-outcomes`
- `feature/m4-04-paper-renderer`

Prefer small PRs even if you merge your own work.

## 7. Commit style

Examples:
- `feat(curriculum): add versioned outcome model`
- `feat(papers): add deterministic mark validation`
- `test(assessment): cover blueprint scope rules`
- `docs(adr): record modular monolith decision`

## 8. Architecture decisions

Use ADRs when changing:
- framework/infrastructure;
- auth model;
- database strategy;
- AI provider architecture;
- paper renderer;
- curriculum versioning;
- question versioning;
- job system.

Do not create ADRs for routine implementation details.

## 9. Quality gates

Before merge:
- typecheck;
- lint;
- unit tests;
- integration tests;
- build;
- relevant E2E;
- schema migration checked;
- no secrets;
- acceptance criteria manually checked.

## 10. Testing pyramid

### Unit
Domain rules:
- scope validation;
- mark allocation;
- question selection;
- paper totals;
- version immutability.

### Integration
Database + domain:
- create assessment;
- build blueprint;
- approve question;
- generate paper.

### E2E
Main parent flow.

### Golden fixtures
PDFs and later AI outputs.

## 11. AI eval discipline — for later milestones

Never "improve" an AI prompt based on one example.

Maintain fixtures and score:
- scope extraction accuracy;
- curriculum mapping accuracy;
- question correctness;
- marking agreement;
- confidence calibration.

Version prompt templates.

## 12. Weekly solo-project rhythm

Suggested:

### Beginning of week
Choose one milestone outcome and 3–5 small issues.

### During week
Keep WIP low. Finish before starting more.

### End of week
Run full tests, deploy staging, write a short changelog:
- shipped;
- learned;
- defects;
- next priorities.

## 13. Do not optimise early

Avoid until needed:
- microservices;
- vector database;
- Kubernetes;
- custom auth;
- complex event sourcing;
- real-time collaboration;
- native mobile apps;
- multi-region deployment.

## 14. When to refactor

Refactor when:
- duplicated domain logic appears in 3+ places;
- a module boundary is clearly wrong;
- testability is suffering;
- performance measurement shows a real bottleneck.

Do not refactor simply because Claude suggests a "cleaner architecture".

## 15. Release strategy

Use feature flags for unfinished admin/user features.

Recommended early environments:
- local;
- preview/staging;
- production.

Do not use real child data in staging.

## 16. Suggested first demo

A strong first demo is not AI.

Demo:
1. Sign in.
2. Add child.
3. Create P3 Maths assessment.
4. Select 3 curriculum outcomes.
5. Set 30 marks / 40 minutes.
6. Generate blueprint.
7. Generate a different but valid mock twice.
8. Download student PDF and answer pack.

If this feels excellent, the core architecture is working.


# UX implementation discipline

For every family-facing issue, add a short UX review to the completion report:
- What is the one primary action?
- Does this add or alter primary navigation?
- Is any advanced detail exposed by default unnecessarily?
- Can returning users resume?
- Are error/recovery states obvious?
- Does the flow satisfy `USABILITY_ACCEPTANCE_CRITERIA.md`?

Do not accept a feature because the screenshots look polished. Test the task.

Before broad beta, run parent and child task-based usability tests with participants who have not seen the product.
