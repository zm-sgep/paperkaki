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

## Local development

Prerequisites:

- Node.js 22 (`.nvmrc`; run `nvm use`) and npm 10 or newer.
- No database server is needed for local work: the default `DATABASE_URL` uses a file-backed PGlite database under `.data/` (git-ignored).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Apply the database migrations (creates `.data/dev` on first run):

```bash
npm run db:migrate
```

Open http://localhost:3000 and sign in with any email address (development sign-in, no password; emails in `DEV_ADMIN_EMAILS` get the admin area at `/admin`). Environment variables are validated when Next.js loads its config (`src/config/env.ts`); a missing or invalid variable stops startup and the error names each one without printing values.

## Checks

| Command | What it runs |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint flat config, including architecture boundary rules |
| `npm run test:unit` | Vitest unit tests (`tests/unit`) |
| `npm run test:integration` | Vitest integration tests against an in-memory PGlite database (`tests/integration`) |
| `npm test` | Unit and integration tests |
| `npm run build` | Production build |
| `npm run test:e2e` | Playwright smoke tests on a phone and an iPad landscape viewport (`tests/e2e`). Builds and starts the app on port 3100 with in-memory PGlite. |
| `npm run check` | All of the above, in order |

Database commands: `npm run db:generate` creates a migration from the schema files in `src/repositories/postgres/schema/`; `npm run db:migrate` applies pending migrations to whatever `DATABASE_URL` points at (PostgreSQL or PGlite). Commit generated files under `drizzle/`.

Playwright needs Chromium. In a fresh checkout run `npx playwright install chromium` once. If a browser is already installed elsewhere, set `PLAYWRIGHT_CHROMIUM_PATH` to its executable.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit and integration tests, applies the migrations to a `postgres:16` service and checks the schema files match them, builds, and runs the Playwright smoke tests.

## Docs

Start with [`CLAUDE.md`](CLAUDE.md) (product objective, UX invariants, architecture boundaries and required reading order). Everything else lives in [`docs/`](docs/): product, UX, architecture, data model, backlog and decision records (`docs/decisions/`). `src/README.md` maps each source folder to what it owns and what it may not import.

Ground rules that apply to every change:

- Do **not** ask an LLM to generate a complete exam paper directly. The system builds a structured assessment blueprint, selects or generates validated question items, validates the paper, then renders it deterministically.
- Do not expose internal system concepts such as `Assessment Blueprint`, outcome IDs, reward multipliers, confidence internals or question-bank structure to ordinary parents or children unless they explicitly open an advanced/admin view.
