import { CurriculumImportSchema, type CurriculumImportFile } from "@/schemas/curriculum-import";
import type { ImportIssue } from "./errors";

/**
 * Validates and normalises a curriculum import file (M1-04). Errors name the JSON path and
 * the reason so a person can fix the file without reading code.
 */

export type NormalizedOutcome = {
  code: string;
  statement: string;
  childLabel: string;
  level: string;
  sortOrder: number;
  sourceRefs: { sourceKey: string; pageOrSection: string | null }[];
};

export type NormalizedTopic = {
  code: string;
  title: string;
  parentLabel: string;
  level: string;
  sortOrder: number;
  scopeNotes: string[];
  outcomes: NormalizedOutcome[];
};

export type NormalizedDomain = {
  code: string;
  title: string;
  sortOrder: number;
  topics: NormalizedTopic[];
};

export type NormalizedSource = {
  key: string;
  title: string;
  publisher: string;
  url: string | null;
  provenance: CurriculumImportFile["sources"][number]["provenance"];
  verification: "unverified" | "verified";
  accessedOn: string | null;
  notes: string | null;
};

export type NormalizedCurriculum = {
  version: { code: string; subject: string; title: string; levels: string[]; effectiveFrom: string | null };
  sources: NormalizedSource[];
  domains: NormalizedDomain[];
  relationships: { from: string; to: string; kind: "prerequisite" | "progression" }[];
};

export type ImportValidation =
  | { ok: true; curriculum: NormalizedCurriculum }
  | { ok: false; issues: ImportIssue[] };

/** `["domains", 0, "code"]` becomes `domains[0].code`. */
export function formatJsonPath(path: readonly PropertyKey[]): string {
  let result = "";
  for (const part of path) {
    if (typeof part === "number") {
      result += `[${part}]`;
    } else {
      result += result === "" ? String(part) : `.${String(part)}`;
    }
  }
  return result;
}

export function validateCurriculumImport(input: unknown): ImportValidation {
  const parsed = CurriculumImportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({ path: formatJsonPath(issue.path), message: issue.message })),
    };
  }
  const issues = checkReferences(parsed.data);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, curriculum: normalize(parsed.data) };
}

function checkReferences(file: CurriculumImportFile): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  const levels = file.curriculumVersion.levels;
  levels.forEach((level, index) => {
    if (levels.indexOf(level) !== index) {
      add(`curriculumVersion.levels[${index}]`, `duplicate level ${level}`);
    }
  });

  const sourceIds = new Set<string>();
  file.sources.forEach((source, index) => {
    if (sourceIds.has(source.id)) {
      add(`sources[${index}].id`, `duplicate source id ${source.id}`);
    }
    sourceIds.add(source.id);
  });

  const levelProblem = (level: string | undefined, path: string) => {
    if (level === undefined) {
      if (levels.length > 1) {
        add(path, `missing level: this version covers ${levels.join(", ")}, so each topic and outcome must say which`);
      }
    } else if (!levels.includes(level)) {
      add(path, `level ${level} is not one of this version's levels (${levels.join(", ")})`);
    }
  };

  const domainCodes = new Set<string>();
  const topicCodes = new Set<string>();
  const outcomeCodes = new Set<string>();
  const seenCode = (seen: Set<string>, code: string, path: string) => {
    if (seen.has(code)) {
      add(path, `duplicate code ${code}`);
    }
    seen.add(code);
  };

  file.domains.forEach((domain, di) => {
    seenCode(domainCodes, domain.code, `domains[${di}].code`);
    domain.topics.forEach((topic, ti) => {
      const topicPath = `domains[${di}].topics[${ti}]`;
      seenCode(topicCodes, topic.code, `${topicPath}.code`);
      levelProblem(topic.level, `${topicPath}.level`);
      topic.outcomes.forEach((outcome, oi) => {
        const outcomePath = `${topicPath}.outcomes[${oi}]`;
        seenCode(outcomeCodes, outcome.code, `${outcomePath}.code`);
        levelProblem(outcome.level, `${outcomePath}.level`);
        if (outcome.level !== undefined && topic.level !== undefined && outcome.level !== topic.level) {
          add(`${outcomePath}.level`, `level ${outcome.level} differs from its topic's level ${topic.level}`);
        }
        const refs = outcome.sourceRefs ?? (outcome.sourceRef ? [outcome.sourceRef] : []);
        refs.forEach((ref, ri) => {
          if (!sourceIds.has(ref.sourceId)) {
            const refPath = outcome.sourceRefs ? `${outcomePath}.sourceRefs[${ri}]` : `${outcomePath}.sourceRef`;
            add(
              `${refPath}.sourceId`,
              `unknown source id ${ref.sourceId}; declare it in sources (declared: ${[...sourceIds].join(", ")})`,
            );
          }
        });
      });
    });
  });

  (file.relationships ?? []).forEach((relationship, index) => {
    for (const end of ["from", "to"] as const) {
      if (!outcomeCodes.has(relationship[end])) {
        add(`relationships[${index}].${end}`, `unknown outcome code ${relationship[end]}`);
      }
    }
    if (relationship.from === relationship.to) {
      add(`relationships[${index}].to`, "an outcome cannot relate to itself");
    }
  });

  return issues;
}

function normalize(file: CurriculumImportFile): NormalizedCurriculum {
  const versionLevels = file.curriculumVersion.levels;
  const onlyLevel = versionLevels.length === 1 ? versionLevels[0] : undefined;

  return {
    version: {
      code: file.curriculumVersion.code,
      subject: file.curriculumVersion.subject,
      title: file.curriculumVersion.title,
      levels: versionLevels,
      effectiveFrom: file.curriculumVersion.effectiveFrom ?? null,
    },
    sources: file.sources.map((source) => ({
      key: source.id,
      title: source.title,
      publisher: source.publisher,
      url: source.url ?? null,
      provenance: source.provenance,
      verification: source.verification,
      accessedOn: source.accessed ?? null,
      notes: source.notes ?? null,
    })),
    domains: file.domains.map((domain, di) => ({
      code: domain.code,
      title: domain.title,
      sortOrder: domain.sortOrder ?? di + 1,
      topics: domain.topics.map((topic, ti) => {
        const topicLevel = topic.level ?? onlyLevel ?? "";
        return {
          code: topic.code,
          title: topic.title,
          parentLabel: topic.parentLabel,
          level: topicLevel,
          sortOrder: topic.sortOrder ?? ti + 1,
          scopeNotes: topic.notes ?? [],
          outcomes: topic.outcomes.map((outcome, oi) => ({
            code: outcome.code,
            statement: outcome.statement,
            childLabel: outcome.childLabel,
            level: outcome.level ?? topicLevel,
            sortOrder: oi + 1,
            sourceRefs: (outcome.sourceRefs ?? (outcome.sourceRef ? [outcome.sourceRef] : [])).map((ref) => ({
              sourceKey: ref.sourceId,
              pageOrSection: ref.pageOrSection ?? null,
            })),
          })),
        };
      }),
    })),
    relationships: (file.relationships ?? []).map((relationship) => ({ ...relationship })),
  };
}
