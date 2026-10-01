# Overnight run, 1–2 October 2026: more P3 Maths questions for every outcome

Morning summary: written at the end of the run, above this line.

## The goal Zhimin set
Every one of the 38 P3 Maths outcomes in `content/curriculum/p3-maths-moe-2025-10.json` has at least 15 questions in the bank. Each outcome also has at least 5 MCQs (2 of them worth 2 marks), 8 other questions, 3 word problems worth 3 or more marks, 3 basic and 3 challenging questions. About 206 new questions are needed.

## The rules for this run
- Work happens on the local branch `overnight-2026-10-01`, made from `main` at `85ed6bf`.
- Each finished batch is committed locally. Nothing is pushed, merged or deployed.
- Before each commit, typecheck, lint, all Vitest tests and all Playwright tests (`--workers=2`) must pass.
- The app makes no paid AI calls. No API key is added.
- A product decision is put on hold for Zhimin. It is not guessed.
- A blocked batch is parked with its reason, and the run goes on to the next batch.
- New questions are auto-approved for development only, like the 402 already in the bank. A person must review them in `/admin` before real families use them (ADR-0012).
- No syllabus outcome is added or changed.

## How the work is split
- Sonnet writes the questions, one topic group per writer, into a staging folder outside the repo.
- Each file must pass a checker that uses the app's own question schema and answer verifier. The checker also refuses clashing family codes and repeated stems.
- Haiku then solves every new question from the stem alone. Opus compares those answers with the answer key and fixes or drops any question where they disagree.
- Opus moves the checked files into `content/questions/`, runs the full gate, and commits.

## Batches
| Batch | What | Status |
|---|---|---|
| 0 | Fix the test that failed when the chosen word problem had a unit ("$0.01") | DONE |
| 1 | Numbers up to 10 000 (P3-NA-WN): 41 new | writing |
| 2 | Multiplication and division (P3-NA-MD) and mental addition (P3-NA-AS-04): 41 new | writing |
| 3 | Fractions (P3-NA-FR): 31 new | writing |
| 4 | Length, mass and volume (P3-MG-LM) and time (P3-MG-TM): 33 new | writing |
| 5 | Area and perimeter (P3-MG-AR): 34 new | writing |
| 6 | Angles, perpendicular and parallel lines, bar graphs (P3-MG-AN, P3-MG-PL, P3-ST-BG): 26 new | writing |

## Batch entries

### Batch 0 is done: the "$0.01" test now expects the question's unit (2 October 2026)
- Cause: `tests/integration/marking-review.test.ts` typed "0.01" for a word problem and expected to see "0.01". The app shows the answer box's unit with the answer, so a dollar question shows "$0.01" and a length question shows "0.01 cm". The assessment ID is random, so the chosen question, and its unit, changed from run to run.
- Fix: the test now works out the expected text from the chosen question's unit. Only the test changed. The app did not change.
- Gate: typecheck 0 errors, lint 0 warnings, Vitest 1,361 passed of 1,361, Playwright 128 passed of 128 (`--workers=2`).
