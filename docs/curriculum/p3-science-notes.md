# Primary 3 Science: notes on the MOE syllabus extraction

Source: "SCIENCE TEACHING & LEARNING SYLLABUS Primary Three to Six, Standard / Foundation, Implementation starting with 2023 Primary Three Cohort, Updated Jan 2026", 87 PDF pages, sha256 `0556023ceb55fe80de75ae044011b8c77ea7ea494a1873d2b224a9b2b8083ab0`, https://moe.gov.sg/media/files/primary/syllabus/Primary%20Science%20Syllabus%202023.pdf (accessed 2026-09-30).

Output file: `content/p3-science-curriculum-moe2026.json` (3 themes, 6 topics, 27 outcomes, all `unverified`, version `draft`).

Page numbers below are the **printed** numbers at the foot of each page. Printed page N is PDF page N+1 (the cover page is unnumbered).

## (a) How the syllabus shows levels, and where the P3 content is

**Five themes, four levels.** The syllabus has five themes: "Diversity, Cycles, Systems, Energy, and Interactions" (p. 11). Table 2 on p. 20 ("An Overview of the topics in the Primary Science Syllabus") lists the topics per level, P3 to P6.

**Level marker in the detail pages.** Section 5 (pp. 36-80) has one learning-outcomes table per topic. The level is in each table heading, in brackets:

- P3 and P4 headings carry only the level, for example "Diversity of Materials (P3)", "Cycles in Matter and Water (Matter) (P4)".
- P5 and P6 headings carry level and stream, for example "(P5 Standard)", "(P5 Foundation)", "(P6 Standard)".
- Table 2 note, p. 20: "Topics which are underlined are not required for students taking Foundation Science." Only two P6 items are underlined in the rendered table ("Energy Conversion" and "elastic spring force"). No P3 topic is underlined and no P3 topic has a separate Foundation table, so the P3 content applies to both Standard and Foundation. (That is our reading of the marking; the syllabus does not state it in a sentence.)

**Primary 3 topics (Table 2, p. 20) and where the detail is.** Theme placement comes from position in Section 5: each topic table follows its theme's "About <Theme>" page (Diversity p. 37, Cycles p. 41, Interactions p. 61). Table 2 itself does not align topics to themes.

| Theme | Syllabus topic heading | Printed page | PaperKaki topic code(s) |
|---|---|---|---|
| Diversity | Diversity of Living and Non-Living Things (General characteristics and classification) (P3) | 38 | P3-SC-DIV-LN, P3-SC-DIV-CL |
| Diversity | Diversity of Materials (P3) | 39-40 (last note runs onto p. 40) | P3-SC-DIV-MA |
| Cycles | Cycles in Plants and Animals (Life Cycles) (P3) | 42 | P3-SC-CYC-PL, P3-SC-CYC-AN |
| Interactions | Interaction of Forces (Magnets) (P3) | 62 | P3-SC-INT-MG |

**No P3 content in Systems or Energy.** Their first topics are P4 (Human system, Digestive, p. 53; Plant system, Plant parts and functions, p. 56; Cycles in Matter and Water, Matter, p. 48; Energy Light p. 75, Heat pp. 76-77).

**Columns in each table.** Each P3 table has three columns: Core Ideas (knowledge and understanding), Practices (skills and processes), Values, Ethics and Attitudes. The JSON imports Core Ideas and Practices bullets as outcomes and names the column in each `sourceRef`. The Values column (for example "Show curiosity by questioning and exploring the surrounding living and non-living things.") is quoted in each topic's `notes` and not imported as outcomes, because it is not something a question can test.

**Notes kept as topic scope.** Each table's italic "Note:" lines are quoted verbatim in the topic `notes`. The "not required" limits are:

- Classification (p. 38): "Recall of names of specific living things (e.g., guppy) and their characteristics (e.g., give birth to young alive) is not required."
- Float/sink (p. 39): "(The concept of density is not required.)"
- Transparency (p. 40): "(The use of terms – transparent/ translucent/ opaque is not required.)"
- Life cycles (p. 42): plant reproduction processes "(pollination, fertilisation, seed dispersal and germination) are introduced in the topic of Cycles in Plants and Animals (Reproduction) in P5."
- Magnets (p. 62): "Recall of magnetic materials such as nickel and cobalt is not required." and "Magnetic shielding and magnetic induction are not required."

**Statement conventions (same as the Maths file where possible).** Where a bullet has sub-bullets, each sub-bullet is one outcome, and the statement is the lead-in bullet plus the sub-bullet joined by a space with the words unchanged. The sub-bullet "Magnets have two poles. A freely suspended bar magnet comes to rest pointing in a North-South direction." is split into two outcomes by quoting each sentence. "Make a magnet by the stroke method and the electrical method." is kept whole because the second half is not a quotable sentence on its own.

## (b) Differences between the syllabus and the school's P3 list

School list: Diversity of living and non-living things; Classification of living things; Diversity of materials; Life cycles of plants; Life cycles of animals; Properties of magnets; Making and using magnets.

**Scope: no difference.** Every school item is P3 content in the syllabus, and the syllabus has no other P3 topic. Nothing on the school list is placed at a different level by the syllabus.

**Structure: the syllabus groups more coarsely.**

1. The school's "Diversity of living and non-living things" and "Classification of living things" are one MOE topic, "Diversity of Living and Non-Living Things (General characteristics and classification)" (p. 38). We keep the school's split (P3-SC-DIV-LN / P3-SC-DIV-CL) as a PaperKaki grouping, noted on both topics.
2. "Life cycles of plants" and "Life cycles of animals" are one MOE topic, "Cycles in Plants and Animals (Life Cycles)" (p. 42). We split it as P3-SC-CYC-PL / P3-SC-CYC-AN along the syllabus's own "Plants" / "Animals" sub-bullets and its separate plant and animal practice bullets.
3. "Properties of magnets" and "Making and using magnets" are one MOE topic, "Interaction of Forces (Magnets)" (p. 62). We kept it as one topic, P3-SC-INT-MG, because the syllabus gives no sub-division. A drafter's suggestion for matching (not MOE's): "properties" corresponds to the push/pull and characteristics bullets and "Compare magnets, non-magnetic materials and magnetic materials."; "making" to "Make a magnet by the stroke method and the electrical method."; "using" to "Recognise uses of magnets in everyday objects."

**Detail the school list does not show but the syllabus names.**

- Classification covers four kinds of living thing, not only plants and animals: "Plants (flowering, non-flowering)", "Animals (amphibians, birds, fish, insects, mammals, reptiles)", "Fungi (mould, mushroom, yeast)", "Bacteria" (p. 38). The skill of classifying is worded as "Classify living things into broad groups (in plants and animals)".
- Life cycles of plants: "The focus is on the stages (seed, young plant, adult plant) of flowering plants." Animals named: "chicken, cockroach, frog, grasshopper, beetle, butterfly, mosquito" (p. 42).
- Materials named: "wood, metal, ceramic, rubber, glass, plastic, fabric"; properties named: "Strength", "Flexibility", "Ability to float/sink in water", "Waterproof", "Transparency" (p. 39).
- Making magnets names two methods: "the stroke method and the electrical method" (p. 62). The school's "Making" may cover only one; the syllabus names both.

**Topics the syllabus puts later than P3 (check a school scope does not drift into them):** plant parts and functions, digestive system, matter (P4, pp. 48, 53, 56); light and heat (P4, pp. 75-77); reproduction in plants and animals, water, respiratory and circulatory systems, electrical system (P5); forces other than magnets, photosynthesis, energy conversion, interactions within the environment (P6).

## (c) Assessment and skills notes relevant to P3 question types

The syllabus gives no P3 paper format, mark scheme or question-type list. What it does give:

**Assessment (Section 4).**

- p. 34: "The assessment objectives of the syllabus are aligned to the three domains in the Science curriculum framework." The three domains are "Core Ideas of Science, Practices of Science and the Values, Ethics & Attitudes in Science" (p. 5).
- p. 34: "In addition to the written tests, teachers can also conduct performance-based assessment using the following modes:" then Checklists, Debates, Drama / Show and Tell, Games and Quizzes, Learning Trails, Model-making, Posters, Practicals, Projects, Reflections / Journals, Teacher Observations.
- p. 35: "It is essential for assessment to be aligned to the intended learning outcomes." Table 3, recommended weighting for school-based assessment: Written Tests 70% - 85%, Performance-based assessments 15% - 30%, the same for Standard and Foundation Science.

**Practices column bullets tied to P3 topics** (these are the skills outcomes in the JSON):

- p. 38: "Observe a variety of living and non-living things and infer differences between them." and "Classify living things into broad groups (in plants and animals) based on similarities and differences of common observable characteristics."
- p. 39: "Compare physical properties of materials."
- p. 42: "Observe and compare the life cycles of plants grown from seeds over a period of time." and "Observe and compare the life cycles of animals over a period of time (chicken, cockroach, frog, grasshopper, beetle, butterfly, mosquito)"
- p. 62: "Compare magnets, non-magnetic materials and magnetic materials." and "Make a magnet by the stroke method and the electrical method."

**Glossary of command words (pp. 82-83)**, the syllabus's own meaning of the verbs used in the P3 outcomes:

- observe: "to obtain information through the use of the senses"
- compare: "to identify similarities and differences between objects, concepts or processes"
- classify: "to group objects or events based on common characteristics"
- infer: "to explain or draw a conclusion based on observations, data or information"
- describe: "to write (using diagrams where appropriate) the main points of a topic"
- recognise: "to identify facts, characteristics or concepts that are critical to the understanding of a situation, event, process or phenomenon"
- relate: "to identify and explain the relationships between objects, concepts or processes"
- identify: "to select and/or name the object, event, concept or process"
- show an understanding: "to recall information (facts, concepts, models, data), translate information from one form to another, explain information and apply information"
- state: "to give a concise answer with little or no supporting argument"

**Ways of Thinking and Doing, Table 1 (pp. 15-18), progression "By the end of P4".** The table gives expectations at the end of P4 and P6 only, so it is the nearest statement for P3 (no P3-specific column exists). Not imported as outcomes because it is not tied to a P3 topic.

- Posing questions and defining problems (p. 15): "Ask questions out of curiosity or to deepen understanding." "Ask questions which can be investigated."
- Designing investigations (p. 15): "Recognise a fair test (changed/ unchanged variables)."
- Conducting investigations and testing solutions (p. 16): "Use senses, apparatus, and equipment to gather data." "Investigate to find out answers to questions (guided investigations)." "Record and/or compare observations/ data with suggested scaffolding."
- Analysing and interpreting data (p. 16): "Simple analysis of data and information in representations (e.g., tables, bar and line graphs, charts, and diagrams) to infer patterns and relationships or explain findings."
- Communicating, evaluating and defending ideas with evidence (p. 17): "Communicate (e.g., written, verbal, pictorial, tabular or graphical) clear explanation and reasoning." "Seek clarification to deepen understanding."
- Making informed decisions and taking responsible actions (p. 17): "State or select options based on appropriate criteria with reasons."
- Using and developing models (p. 17): "Use multiple representations (e.g., pictures, charts, diagrams, tables, graphs) to explain concepts, describe and predict phenomena."
- Constructing explanations and designing solutions (p. 18): "Construct possible explanations and generate ideas."

For the last four rows and "Posing questions" the printed cell spans both the P4 and P6 columns, so we read them as applying at both levels.

**Drafter's inference (not in the syllabus):** for P3 the skills that can be set as written questions are observing and inferring from a described or pictured observation, comparing and classifying given items against stated characteristics, reading a simple table or chart, and explaining a result in words. Fair-test language is stated only at the end of P4, so treat it as a stretch item at P3.

## (d) Items not read reliably, and other cautions

- All six P3 pages (PDF pp. 21, 39, 40, 41, 43, 63) were rendered and read as images, and every statement and note in the JSON was machine-matched to the extracted page text. No text was unreadable.
- Standard vs Foundation at P3 is inferred from the missing "(P3 Standard)" / "(P3 Foundation)" split and from no underline in Table 2. The syllabus does not state it in words.
- `effectiveFrom` "2026-01-01" was set from the brief. The PDF says "Implementation starting with 2023 Primary Three Cohort" and "Updated Jan 2026"; it does not give a day.
- The animal life-cycles practice bullet has no closing full stop in print. The statement keeps it as printed.
- "Transparency" (p. 39) has its note on the next page (p. 40); the outcome cites p. 39.
- Splitting the Diversity and Life Cycles topics, the topic titles of the split topics, the joining of lead-in and sub-bullet, the `childLabel`s and the `parentLabel`s are our wording or grouping, not MOE's.
- Table 1 cell merges (see section c) are our reading of the table layout.
- Table 2 does not align topics to themes; theme placement uses Section 5 order (see section a).
- A human must still check every statement against the PDF before any outcome is marked verified.
