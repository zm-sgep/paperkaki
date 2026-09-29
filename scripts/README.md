# Scripts

Run with `npm run <name>`; each reads `DATABASE_URL` from the environment or `.env.local`.

| Script | Command | What it does |
| --- | --- | --- |
| `db-migrate.ts` | `npm run db:migrate` | Applies pending migrations. Safe to repeat. |
| `db-seed.ts` | `npm run db:seed` | Development only. Migrates, imports the P3 Mathematics curriculum and publishes it with `allowUnverified` (ADR-0012). Refuses when `NODE_ENV=production`. Safe to repeat. |
| `import-curriculum.ts` | `npm run curriculum:import -- <file.json>` | Imports a curriculum file into a DRAFT version. Never publishes. Safe to repeat. |

## Curriculum import format

One JSON file per curriculum version, kept under `content/curriculum/`. The zod schema in
`src/schemas/curriculum-import.ts` is the definition; cross-record rules are in
`src/domain/curriculum/import-validation.ts`.

- `curriculumVersion`: `code` (unique), `subject`, `title`, `levels` (`"P1"`..`"P6"`), optional `effectiveFrom`.
- `sources[]`: `id`, `title`, `publisher`, `provenance`, `verification`, optional `url`, `accessed`, `notes`.
- `domains[].topics[].outcomes[]`: `code`, `statement` (the source's wording), `childLabel`, and a `sourceRef` (`sourceId`, optional `pageOrSection`) or `sourceRefs[]`. Topics also carry `title`, `parentLabel`, optional `sortOrder` and `notes` (quoted scope limits).
- `relationships[]` (optional): `from`, `to` (outcome codes), `kind` (`prerequisite` or `progression`).

Rules: codes are unique across the file; every outcome names a declared source; levels belong to the
version; a file can only say `"unverified"` (a named person marks outcomes verified in the admin
curriculum browser). Errors name the JSON path, for example
`domains[0].topics[2].outcomes[1].code: duplicate code P3-NA-FR-02`.

Importing the same file again changes nothing. Importing into a draft updates rows by code and removes
rows the file no longer lists. Importing into a published or retired version fails: import the changes
as a new version.

Do not store tokens in this folder.
