import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CurriculumImportError, formatImportIssue, validateCurriculumImport } from "@/domain/curriculum";
import { parseCurriculumJson } from "@/application/commands/import-curriculum";

type Json = Record<string, unknown>;

function validFile(): Json {
  return {
    curriculumVersion: { code: "TEST-V1", subject: "Test Subject", title: "Test curriculum", levels: ["P3"], effectiveFrom: "2025-10-01", status: "draft" },
    sources: [
      { id: "src-1", title: "Test syllabus", publisher: "Test Publisher", provenance: "official_moe", verification: "unverified" },
    ],
    domains: [
      {
        code: "D1",
        title: "Domain one",
        topics: [
          {
            code: "T1",
            title: "Topic one",
            parentLabel: "Topic one for parents",
            outcomes: [
              { code: "O1", statement: "first outcome", childLabel: "First", sourceRef: { sourceId: "src-1", pageOrSection: "p. 1" } },
              { code: "O2", statement: "second outcome", childLabel: "Second", sourceRef: { sourceId: "src-1" } },
            ],
          },
        ],
      },
    ],
  };
}

function edit(change: (file: Json & { domains: Json[]; sources: Json[]; curriculumVersion: Json }) => void): Json {
  const file = structuredClone(validFile()) as Json & { domains: Json[]; sources: Json[]; curriculumVersion: Json };
  change(file);
  return file;
}

function issuesOf(input: unknown): string[] {
  const result = validateCurriculumImport(input);
  if (result.ok) throw new Error("expected the file to be rejected");
  return result.issues.map(formatImportIssue);
}

const firstTopic = (file: { domains: Json[] }) => (file.domains[0] as { topics: Json[] }).topics[0] as { outcomes: Json[] } & Json;

describe("validateCurriculumImport", () => {
  it("accepts a valid file and fills defaults (level, order)", () => {
    const result = validateCurriculumImport(validFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const topic = result.curriculum.domains[0]?.topics[0];
    expect(topic).toMatchObject({ level: "P3", sortOrder: 1, scopeNotes: [] });
    expect(topic?.outcomes.map((outcome) => [outcome.code, outcome.level, outcome.sortOrder])).toEqual([
      ["O1", "P3", 1],
      ["O2", "P3", 2],
    ]);
    expect(topic?.outcomes[1]?.sourceRefs).toEqual([{ sourceKey: "src-1", pageOrSection: null }]);
  });

  it("accepts the committed P3 Mathematics curriculum file", () => {
    const text = readFileSync(path.resolve(import.meta.dirname, "../../content/curriculum/p3-maths-moe-2025-10.json"), "utf8");
    const result = validateCurriculumImport(JSON.parse(text));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.curriculum.version.code).toBe("SG-MOE-PRI-MATH-2021-UPD-2025-10");
    const outcomes = result.curriculum.domains.flatMap((domain) => domain.topics.flatMap((topic) => topic.outcomes));
    expect(outcomes).toHaveLength(38);
    expect(outcomes.every((outcome) => outcome.sourceRefs.every((ref) => ref.pageOrSection !== null))).toBe(true);
    const fractions = result.curriculum.domains.flatMap((domain) => domain.topics).find((topic) => topic.code === "P3-NA-FR");
    expect(fractions?.parentLabel).toBeTruthy();
  });

  it("reports a duplicate outcome code with its JSON path", () => {
    const issues = issuesOf(
      edit((file) => {
        firstTopic(file).outcomes[1] = { ...firstTopic(file).outcomes[0], childLabel: "Copy" };
      }),
    );
    expect(issues).toContain("domains[0].topics[0].outcomes[1].code: duplicate code O1");
  });

  it("reports duplicate topic and domain codes, and duplicate source ids", () => {
    const issues = issuesOf(
      edit((file) => {
        file.domains.push(structuredClone(file.domains[0]) as Json);
        file.sources.push(structuredClone(file.sources[0]) as Json);
      }),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        "domains[1].code: duplicate code D1",
        "domains[1].topics[0].code: duplicate code T1",
        "domains[1].topics[0].outcomes[0].code: duplicate code O1",
        "sources[1].id: duplicate source id src-1",
      ]),
    );
  });

  it("reports an outcome with no source", () => {
    const issues = issuesOf(
      edit((file) => {
        delete firstTopic(file).outcomes[1]?.sourceRef;
      }),
    );
    expect(issues).toEqual([expect.stringMatching(/^domains\[0\]\.topics\[0\]\.outcomes\[1\]\.sourceRef: missing source/)]);
  });

  it("reports an unknown source id and lists the declared ones", () => {
    const issues = issuesOf(
      edit((file) => {
        (firstTopic(file).outcomes[0] as { sourceRef: Json }).sourceRef = { sourceId: "src-typo", pageOrSection: "p. 1" };
      }),
    );
    expect(issues).toEqual([
      "domains[0].topics[0].outcomes[0].sourceRef.sourceId: unknown source id src-typo; declare it in sources (declared: src-1)",
    ]);
  });

  it("reports a level that is not P1 to P6", () => {
    const issues = issuesOf(
      edit((file) => {
        file.curriculumVersion.levels = ["Primary 3"];
      }),
    );
    expect(issues).toEqual(['curriculumVersion.levels[0]: must be a level from "P1" to "P6"']);
  });

  it("reports a topic level outside the version's levels", () => {
    const issues = issuesOf(
      edit((file) => {
        firstTopic(file).level = "P4";
      }),
    );
    expect(issues).toContain("domains[0].topics[0].level: level P4 is not one of this version's levels (P3)");
  });

  it("requires a level on each topic when the version covers several levels", () => {
    const issues = issuesOf(
      edit((file) => {
        file.curriculumVersion.levels = ["P3", "P4"];
      }),
    );
    expect(issues[0]).toMatch(/^domains\[0\]\.topics\[0\]\.level: missing level/);
  });

  it("refuses a file that claims an outcome is verified", () => {
    const issues = issuesOf(
      edit((file) => {
        firstTopic(file).outcomes[0] = { ...firstTopic(file).outcomes[0], verification: "verified" };
      }),
    );
    expect(issues).toEqual([expect.stringMatching(/^domains\[0\]\.topics\[0\]\.outcomes\[0\]\.verification: must be "unverified"/)]);
  });

  it("refuses a file that says it is published", () => {
    const issues = issuesOf(
      edit((file) => {
        file.curriculumVersion.status = "published";
      }),
    );
    expect(issues).toEqual([expect.stringMatching(/^curriculumVersion\.status: must be "draft"/)]);
  });

  it("reports misspelt keys, missing fields and empty text", () => {
    const issues = issuesOf(
      edit((file) => {
        const outcome = firstTopic(file).outcomes[0] as Json;
        delete outcome.childLabel;
        outcome.statment = "typo";
        outcome.code = "bad code!";
      }),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^domains\[0\]\.topics\[0\]\.outcomes\[0\]\.childLabel: /),
        expect.stringMatching(/^domains\[0\]\.topics\[0\]\.outcomes\[0\]\.code: must be a code/),
        expect.stringMatching(/^domains\[0\]\.topics\[0\]\.outcomes\[0\]: Unrecognized key.*statment/),
      ]),
    );
  });

  it("reports relationships that name unknown outcomes", () => {
    const issues = issuesOf(
      edit((file) => {
        (file as Json).relationships = [{ from: "O1", to: "O404", kind: "prerequisite" }];
      }),
    );
    expect(issues).toEqual(["relationships[0].to: unknown outcome code O404"]);
  });

  it("reports every problem it can find at once, not just the first", () => {
    const issues = issuesOf(
      edit((file) => {
        delete firstTopic(file).outcomes[0]?.childLabel;
        file.curriculumVersion.levels = ["Grade 3"];
        file.sources.push({ id: "src-2", title: "", publisher: "P", provenance: "official_moe", verification: "unverified" });
      }),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^curriculumVersion\.levels\[0\]: /),
        expect.stringMatching(/^domains\[0\]\.topics\[0\]\.outcomes\[0\]\.childLabel: /),
        expect.stringMatching(/^sources\[1\]\.title: /),
      ]),
    );
  });

  it("turns broken JSON into an import error", () => {
    expect(() => parseCurriculumJson("{ nope", "curriculum.json")).toThrow(CurriculumImportError);
    expect(() => parseCurriculumJson("{ nope", "curriculum.json")).toThrow(/curriculum\.json is not valid JSON/);
  });
});
