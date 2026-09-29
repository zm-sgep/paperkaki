# Start Here — Prompt to Claude Code

Paste the following into Claude Code after placing this pack in the repository root:

---

Read `CLAUDE.md` and all documents it marks as required reading. Treat the UX rules and accepted ADRs as product constraints, not suggestions.

Do not attempt to build the whole application in one pass. First inspect the repository and tell me:

1. which documented milestone/backlog item should be implemented next based on the current code;
2. any mismatch between current code and the documented architecture/UX rules;
3. a concise implementation plan for that single issue, including tests.

Do not edit code until you have completed that inspection and plan.

The product's UX north star is: the parent or child should almost always know what to do next without a manual. Do not add navigation destinations, settings, dashboards or controls merely because the backend supports them.

---
