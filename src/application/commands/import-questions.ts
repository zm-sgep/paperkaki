import {
  QuestionError,
  fieldIssues,
  formatFieldIssues,
  questionFingerprint,
  verifyQuestionAnswer,
} from "@/domain/questions";
import { recordAuditEvent } from "@/lib/audit";
import type { Database } from "@/repositories/postgres/client";
import { findVersionByCode, listVersions } from "@/repositories/postgres/curriculum";
import { getReadyDb } from "@/repositories/postgres/ready";
import {
  findFamilyByCode,
  getQuestionOutcomes,
  getVersionForQuestions,
  listFamilyVersions,
  getQuestion,
  resolveOutcomesInVersion,
  updateDraftQuestion,
  updateFamilyTitle,
} from "@/repositories/postgres/questions";
import { QuestionDraftSchema, type QuestionDraft } from "@/schemas/question-content";
import { assetAssignments, draftColumns, rowToDraftInput, safeParseDraft } from "../question-drafts";
import { insertDraftVersion, type QuestionActor } from "./questions";

/**
 * Imports question files as DRAFTS (M2-07). The file is a JSON array of question drafts in the
 * shape of QuestionDraftSchema (see content/questions/). Nothing is ever approved here.
 *
 * All-or-nothing: if any entry is invalid, nothing is stored and every problem is listed with
 * the entry it belongs to.
 *
 * Idempotent. A question already in the bank with the same substance (content, answer, marks,
 * outcomes and so on, whatever the JSON key order) is left alone, so importing a file twice
 * changes nothing. For a family code that already exists:
 *   - an entry that matches an existing version is unchanged;
 *   - when exactly ONE entry is new and exactly ONE existing live version was not matched, the
 *     entry is a correction of it: a draft is updated in place, anything else gets a new draft
 *     version that supersedes it (approving it retires the old one);
 *   - otherwise the new entries are additional questions of the same family (a family may hold
 *     several distinct items), each stored as the next version.
 * Entries that share a family code inside one file are siblings, never corrections of each other.
 */

export class QuestionImportError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(["The question file is not valid:", ...issues.map((issue) => `  - ${issue}`)].join("\n"));
    this.name = "QuestionImportError";
    this.issues = issues;
  }
}

export type ImportQuestionsOptions = {
  db?: Database;
  /** Code of the curriculum version the outcome codes belong to. Defaults to the newest published version. */
  curriculumVersionCode?: string;
  actor?: QuestionActor;
  requestId?: string | null;
};

export type ImportQuestionsSummary = {
  curriculumVersionCode: string;
  total: number;
  created: number;
  revised: number;
  updatedDrafts: number;
  unchanged: number;
  familiesCreated: number;
  /** Ids of every draft this run created or changed, in file order. Used by the development seed. */
  changedQuestionIds: string[];
  /** Entries whose automatic answer check fails. They are still imported as drafts and cannot be approved. */
  verifierWarnings: string[];
};

export function parseQuestionsJson(text: string, fileLabel = "the file"): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new QuestionImportError([`${fileLabel} is not valid JSON: ${error instanceof Error ? error.message : "parse error"}`]);
  }
}

async function chooseVersion(db: Database, code: string | undefined) {
  if (code) {
    const found = await findVersionByCode(db, code);
    if (!found) throw new QuestionImportError([`Curriculum version ${code} was not found. Import or seed the curriculum first.`]);
    return found;
  }
  const published = (await listVersions(db)).find((v) => v.status === "published");
  if (!published) {
    throw new QuestionImportError([
      "No published curriculum version exists. Pass the curriculum version code, or import and publish the curriculum first.",
    ]);
  }
  return published;
}

export async function importQuestions(input: unknown, options: ImportQuestionsOptions = {}): Promise<ImportQuestionsSummary> {
  if (!Array.isArray(input)) {
    throw new QuestionImportError(["The file must be a JSON array of questions."]);
  }
  const db = options.db ?? (await getReadyDb());
  const actor: QuestionActor = options.actor ?? { system: true };

  const issues: string[] = [];
  const entries: { index: number; draft: QuestionDraft }[] = [];
  input.forEach((raw: unknown, index: number) => {
    const parsed = QuestionDraftSchema.safeParse(raw);
    const label = `[${index}] ${typeof (raw as { familyCode?: unknown } | null)?.familyCode === "string" ? (raw as { familyCode: string }).familyCode : "?"}`;
    if (parsed.success) entries.push({ index, draft: parsed.data });
    else issues.push(...formatFieldIssues(fieldIssues(parsed.error)).map((issue) => `${label}: ${issue}`));
  });
  if (issues.length > 0) throw new QuestionImportError(issues);

  const versionSummary = await chooseVersion(db, options.curriculumVersionCode);
  const summary: ImportQuestionsSummary = {
    curriculumVersionCode: versionSummary.code,
    total: entries.length,
    created: 0,
    revised: 0,
    updatedDrafts: 0,
    unchanged: 0,
    familiesCreated: 0,
    changedQuestionIds: [],
    verifierWarnings: [],
  };

  // Check every outcome code before writing anything, so one typo reports all typos.
  const codes = [...new Set(entries.flatMap((e) => [e.draft.primaryOutcomeCode, ...e.draft.secondaryOutcomeCodes]))];
  const known = await resolveOutcomesInVersion(db, versionSummary.id, codes);
  for (const entry of entries) {
    const unknown = [entry.draft.primaryOutcomeCode, ...entry.draft.secondaryOutcomeCodes].filter((c) => !known.has(c));
    if (unknown.length > 0) {
      issues.push(`[${entry.index}] ${entry.draft.familyCode}: outcome ${unknown.join(", ")} is not part of curriculum version ${versionSummary.code}`);
    }
  }
  if (issues.length > 0) throw new QuestionImportError(issues);

  await db.transaction(async (tx) => {
    const version = await getVersionForQuestions(tx, versionSummary.id);
    if (!version) throw new QuestionError("curriculum_unavailable", "That curriculum version was not found.");
    if (version.status === "retired") {
      throw new QuestionImportError([`Curriculum version ${version.code} is retired; questions cannot be added to it.`]);
    }

    const groups = new Map<string, { index: number; draft: QuestionDraft }[]>();
    for (const entry of entries) {
      groups.set(entry.draft.familyCode, [...(groups.get(entry.draft.familyCode) ?? []), entry]);
    }

    for (const [familyCode, group] of groups) {
      const family = await findFamilyByCode(tx, version.id, familyCode);
      const existing = family ? await listFamilyVersions(tx, family.id) : [];
      const fingerprints = new Map<string, string>();
      for (const row of existing) {
        const full = await getQuestion(tx, row.id);
        const parsed = full ? safeParseDraft(rowToDraftInput(full, await getQuestionOutcomes(tx, row.id))) : null;
        fingerprints.set(row.id, parsed?.ok ? questionFingerprint(parsed.draft) : `unparseable:${row.id}`);
      }

      const claimed = new Set<string>();
      const fresh: { index: number; draft: QuestionDraft }[] = [];
      for (const entry of group) {
        const fingerprint = questionFingerprint(entry.draft);
        const match = existing.find((row) => !claimed.has(row.id) && fingerprints.get(row.id) === fingerprint);
        if (match) {
          claimed.add(match.id);
          summary.unchanged += 1;
        } else {
          fresh.push(entry);
        }
      }
      if (family && group[0] && family.title !== group[0].draft.familyTitle && fresh.length === 0) {
        await updateFamilyTitle(tx, family.id, group[0].draft.familyTitle);
      }

      const unmatchedLive = existing.filter((row) => !claimed.has(row.id) && row.status !== "retired");
      const correction = fresh.length === 1 && unmatchedLive.length === 1 ? (unmatchedLive[0] ?? null) : null;

      for (const entry of fresh) {
        const verdict = verifyQuestionAnswer(entry.draft);
        if (!verdict.ok) {
          summary.verifierWarnings.push(`[${entry.index}] ${familyCode}: ${verdict.reasons.join("; ")}`);
        }
        if (correction && correction.status === "draft") {
          const resolved = (await resolveOutcomesInVersion(tx, version.id, [entry.draft.primaryOutcomeCode, ...entry.draft.secondaryOutcomeCodes]));
          const primary = resolved.get(entry.draft.primaryOutcomeCode);
          if (!primary) throw new QuestionError("unknown_outcome", "The primary outcome was not found.");
          await updateDraftQuestion(
            tx,
            correction.id,
            draftColumns(entry.draft, { level: primary.level, subject: version.subject }),
            [
              { outcomeId: primary.id, role: "primary" },
              ...entry.draft.secondaryOutcomeCodes.map((c) => ({ outcomeId: (resolved.get(c) as { id: string }).id, role: "secondary" as const })),
            ],
            assetAssignments(entry.draft),
          );
          if (family && family.title !== entry.draft.familyTitle) await updateFamilyTitle(tx, family.id, entry.draft.familyTitle);
          await recordAuditEvent(tx, {
            action: "question.edited",
            entityType: "question",
            entityId: correction.id,
            actorProfileId: "profileId" in actor ? actor.profileId : null,
            metadata: { familyCode, version: correction.version, source: "import" },
            requestId: options.requestId ?? null,
          });
          summary.updatedDrafts += 1;
          summary.changedQuestionIds.push(correction.id);
          continue;
        }
        const created = await insertDraftVersion(tx, {
          version,
          draft: entry.draft,
          actor,
          supersedesQuestionId: correction?.id ?? null,
          requestId: options.requestId,
          auditAction: correction ? "question.revised" : "question.created",
        });
        if (!family && created.version === 1) summary.familiesCreated += 1;
        if (correction) summary.revised += 1;
        else summary.created += 1;
        summary.changedQuestionIds.push(created.questionId);
      }
    }

    if (summary.changedQuestionIds.length > 0) {
      await recordAuditEvent(tx, {
        action: "question.imported",
        entityType: "curriculum_version",
        entityId: version.id,
        actorProfileId: "profileId" in actor ? actor.profileId : null,
        metadata: {
          versionCode: version.code,
          created: summary.created,
          revised: summary.revised,
          updatedDrafts: summary.updatedDrafts,
          unchanged: summary.unchanged,
        },
        requestId: options.requestId ?? null,
      });
    }
  });

  return summary;
}
