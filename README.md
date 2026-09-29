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

Open http://localhost:3000. Environment variables are validated when Next.js loads its config (`src/config/env.ts`); a missing or invalid variable stops startup and the error names each one without printing values.

## Checks

| Command | What it runs |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint flat config, including architecture boundary rules |
| `npm run test:unit` | Vitest unit tests |
| `npm test` | Vitest unit tests |
| `npm run build` | Production build |

## Docs

Start with [`CLAUDE.md`](CLAUDE.md) (product objective, UX invariants, architecture boundaries and required reading order). Everything else lives in [`docs/`](docs/): product, UX, architecture, data model, backlog and decision records (`docs/decisions/`). `src/README.md` maps each source folder to what it owns and what it may not import.

Ground rules that apply to every change:

- Do **not** ask an LLM to generate a complete exam paper directly. The system builds a structured assessment blueprint, selects or generates validated question items, validates the paper, then renders it deterministically.
- Do not expose internal system concepts such as `Assessment Blueprint`, outcome IDs, reward multipliers, confidence internals or question-bank structure to ordinary parents or children unless they explicitly open an advanced/admin view.
