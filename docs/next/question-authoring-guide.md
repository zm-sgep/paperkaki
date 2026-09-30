# Question authoring guide

How the Primary 3 Mathematics bank in `content/questions/` was written. Reuse it for new subjects: keep the format, quality rules and validation, and adapt the subject rules (for Science, add parts and `open` answers once `docs/next/science-platform-spec.md` is built).

Task: write original Singapore Primary 3 exam questions as structured JSON for PaperKaki. Write the output file to the path given in the task.

Topics and outcome codes to cover (outcome statements are in the subject's file under `content/curriculum/` — read it first and use only these outcome codes):
TOPIC_LIST

Quantity: about 18 questions per topic, spread across that topic's outcomes (every outcome at least 2). Per topic: about 6 MCQ (questionType "mcq", 1 or 2 marks) and about 12 others ("number", "fraction" or "text", 1 to 4 marks; word problems usually 2 to 4 marks). Difficulty mix per topic: about 30% basic, 50% standard, 20% challenging.

Quality rules:
- Original questions written by you. Do not copy past school or PSLE papers.
- Singapore context and conventions: $ and ¢, km/m/cm, kg/g, ℓ/ml, times like "3.45 p.m.", everyday Singapore names and settings (hawker centre, MRT, library), British spelling. Age-appropriate, kind, no stereotypes.
- Primary 3 limits: whole numbers up to 10 000; multiplication/division by 1-digit numbers up to 3-digit dividends; fractions: related denominators, within one whole, denominators up to 12.
- One unambiguous correct answer. Text-only: no question may need a picture, clock face, graph or diagram.
- MCQ: 4 options with ids A, B, C, D; distractors reflect real mistakes (e.g. forgetting to regroup, adding denominators). For numeric MCQs every option must be only a number or a fraction (the unit goes in the stem), and exactly one option equals the answer.

JSON format: a single array of objects, each exactly:
{
 "familyCode": "<topic code>-F<NN>" (a family = one underlying question idea; give 2 questions the same family only if they are true variants of one idea),
 "familyTitle": "<short internal title>",
 "primaryOutcomeCode": "<outcome code>", "secondaryOutcomeCodes": [],
 "questionType": "mcq"|"number"|"fraction"|"text",
 "difficulty": "basic"|"standard"|"challenging",
 "cognitiveDemand": "recall"|"application"|"reasoning",
 "marks": 1..4, "estimatedSeconds": 30..420,
 "content": {"stem": [Block...], "options": [{"id":"A","c":[Inline...]}, ...] (mcq only)},
 "answer": one of
    {"kind":"mcq","correct":"A"|"B"|"C"|"D"}
    {"kind":"number","value":"1250","unit":"g","display":[{"t":"text","v":"1 kg 250 g"}]}   (unit optional, one of cm m km g kg ml l $ min h; value is the exact number in that unit as a string; display optional)
    {"kind":"fraction","value":"3/4","acceptEquivalent":false,"requireSimplest":true}
    {"kind":"text","accepted":["5.05 p.m.","5.05 pm"]}
 "verification": {"expression":"..."} for number, fraction and numeric MCQ (an arithmetic expression using only integers, decimals, + - * / and parentheses that independently computes the answer from the numbers in the question, e.g. "3450 + 2789" or "3/8 + 2/8"); {"human":true} for text answers and non-numeric MCQs,
 "workedSolution": [Block...] (clear steps a parent can explain to a child),
 "markingScheme": {"method":"exact"} or {"method":"exact_with_unit"}, optional "partialMarks":[{"marks":1,"criterion":"..."}] for 2+ mark word problems,
 "provenance": "original_ai"
}
Inline = {"t":"text","v":"..."} | {"t":"frac","n":3,"d":4} (optional "whole":1 for mixed numbers) | {"t":"blank"} (answer box inside a sentence)
Block = {"t":"p","c":[Inline...]} | {"t":"table","header":true,"rows":[[[Inline...],[Inline...]], ...]}
Write fractions in stems, options and solutions with "frac" inlines, never as "3/4" text.

Validation (required before you finish): write a small Python script using `fractions.Fraction` that, for every item: checks the JSON shape above; evaluates `verification.expression` exactly (no float) and compares it with `answer.value` (number: exact decimal equality; fraction: equality, and simplest form when requireSimplest); for numeric MCQs parses every option and checks exactly one equals the expression result and that it is the `correct` id; checks every outcome code exists in the curriculum file; checks marks 1..4. Fix every failure and re-run until it reports zero failures.

Reply (under 150 words): output path, question count per topic and per type, validation result (paste the final summary line), and anything you could not do.
