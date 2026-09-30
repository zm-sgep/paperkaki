# Handover — state of PaperKaki (30 September 2026)

Read this after `CLAUDE.md`. It says what is built, what is waiting, and what to do next.

## What is built (Primary 3 Mathematics, Milestones 0–11)
- Parent: sign in (development-only login), add child, add assessment, choose topics or upload the school letter (needs an AI key), school paper formats (sections or booklets, remembered per child), generate mocks, print paper and answer pack, send to iPad.
- Child: pairing code or hand-over, Today with one mission, iPad Mock Mode (timer, pen, autosave, unanswered check), results, mistake review, 15-minute practice with hints, progress with stars, Learning Points and rewards.
- Marking: automatic for typed answers and MCQs; AI-assisted (when a key is set) or parent "quick check" otherwise; print-paper upload.
- Learning loop: mastery evidence, targeted practice, adaptive next mock.
- Visual design: tokens in `src/app/globals.css`, components in `src/components/ui/`, child components in `src/components/child/`, illustrations in `src/components/illustrations/`, logo in `src/components/brand/`.
- Content: 38 Maths outcomes from MOE's syllabus (updated October 2025) and 402 original questions; 27 Science outcomes from MOE's Science syllabus (updated January 2026) in `content/curriculum/p3-science-moe-2026-01.json` — not yet imported or used.
- Checks at hand-over: 1,361 unit/integration tests and 128 Playwright tests pass (`npm run check`, `npx playwright test`).

Decisions are recorded in `docs/decisions/ADR-0009` to `ADR-0012`.

## Next work, in order
1. **Primary 3 Science platform** — `docs/next/science-platform-spec.md` (subjects, questions with parts, key-point marking, Booklet A/B format, Science diagrams). A first attempt stopped before changing any code.
2. **Primary 3 Science question bank** — use `docs/next/question-authoring-guide.md`, the Science curriculum file, and the new parts/open-answer format. Target: enough 2-mark MCQs for Booklet A (18 per paper) and structured questions for Booklet B, several papers without repeats.
3. Then, if wanted: English Paper 2, Chinese Paper 2 (both need their own MOE syllabus first).

## Before real families use it
1. A person checks all curriculum outcomes against the MOE PDFs and reviews every question in `/admin` (ADR-0012). Everything is auto-approved for development only.
2. Choose and add a managed login provider (ADR-0010).
3. Add an AI key (`AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`) and run `npm run eval:extraction` to test letter reading for real.
4. Confirm with MOE that storing and showing syllabus outcome wording is allowed for a commercial product.
5. Smaller gaps: HEIC photos not accepted; uploaded PDF pages of a finished paper cannot be shown or reordered; no screen to undo an approved reward.

## How the work was run (worked well)
- One issue at a time: read the ADRs and backlog, write a precise spec, implement, run typecheck, lint, all unit tests and the FULL Playwright suite, then look at phone (390x844) and iPad landscape (1180x820) screenshots before committing.
- Content is validated by script: every question parses with `QuestionDraftSchema`, passes `verifyQuestionAnswer`, and every outcome code exists in the curriculum file.
- Never commit the MOE PDFs or any real school letter (licence and privacy). Tests use invented data only.
