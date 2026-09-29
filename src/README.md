# `src/` module map

Modular monolith (ADR-0001). Dependencies point inward: UI -> application -> domain; repositories and services implement what the application and domain need. Boundaries marked "enforced" are checked by ESLint (`eslint.config.mjs`) and by `tests/unit/architecture-boundaries.test.ts`.

| Module | Owns | May not import |
| --- | --- | --- |
| `app/` | Routes, layouts, error and loading states. Route names follow `docs/INFORMATION_ARCHITECTURE.md` (ADR-0009). | `@/repositories/*` (enforced). Goes through `application/`. |
| `components/` | Presentational React components (`ui/` primitives first). | `@/repositories/*` (enforced). No scoring, selection, reward or mastery rules. |
| `application/` | Commands and queries: use-case orchestration, ownership checks, transactions. | Route code (`app`, `components`). |
| `domain/*` | Pure business rules for curriculum, questions, assessments, papers, attempts, marking, mastery, rewards, recommendations. | `next`, `next/*`, `react`, `react-dom`, `@/app/*`, `@/components/*`, `@/repositories/*`, `@/services/*` (enforced). |
| `repositories/postgres/` | Drizzle client, per-context schema files, queries. Only place that talks to the database. | Route code and UI. Domain types flow in; repositories never hold business rules. |
| `services/*` | Adapters behind interfaces: `ai`, `storage`, `pdf`, `jobs`, `auth`. | Route code and UI. Domain code depends on ports, not on these adapters. |
| `schemas/` | Zod schemas for input, output and AI structured results. | `@/repositories/*`, `@/services/*`. |
| `lib/` | Small cross-cutting helpers: logger, request ID, audit event helper. | Route code and UI components. |
| `config/` | Environment validation (`env.ts`). | Everything except `zod`. Server-side only. |

Route groups: `(parent)/` is the four-destination family shell (Home, Prepare, Progress, Rewards; account is reached from the top bar). `admin/` has its own layout and no family navigation. `sign-in/` is public. Child and mock route groups come later (ADR-0009).

Sign-in and files: every protected layout, page and action calls `requireParent()` / `requireAdmin()` (`application/queries/current-parent.ts`); `proxy.ts` only redirects early. Files are reached only through `issueFileUrl()` (`application/files.ts`), which creates short-lived signed links to `/api/files/{bucket}/{key}`.
