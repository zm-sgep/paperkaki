import {
  CurriculumNotFoundError,
  CurriculumProvenanceError,
  checkCanMarkVerified,
  hasPageReference,
} from "@/domain/curriculum";
import { recordAuditEvent } from "@/lib/audit";
import type { Database } from "@/repositories/postgres/client";
import {
  assertDraftVersion,
  attachPageReference,
  findSourceByCode,
  getOutcomeInVersion,
  insertSourceDocument,
  linkOutcomeToSource,
  listOutcomeLinks,
  setOutcomeVerified,
} from "@/repositories/postgres/curriculum-write";
import { getReadyDb } from "@/repositories/postgres/ready";
import type { SourceDocument } from "@/repositories/postgres/schema";
import { RegisterSourceInputSchema, type RegisterSourceInput } from "@/schemas/curriculum-provenance";

/**
 * Provenance workflow (M1-03): register a source, link an outcome to it with a page or
 * section, and mark an outcome verified. Each step writes an audit event holding ids and
 * codes only. Outcomes of published versions cannot be changed (ADR-0003).
 */

export type CommandContext = { db?: Database; requestId?: string | null; now?: Date };

async function resolveDb(context: CommandContext): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export async function registerSource(
  input: RegisterSourceInput,
  actorProfileId: string | null,
  context: CommandContext = {},
): Promise<SourceDocument> {
  const parsed = RegisterSourceInputSchema.parse(input);
  const db = await resolveDb(context);
  return db.transaction(async (tx) => {
    if (await findSourceByCode(tx, parsed.code)) {
      throw new CurriculumProvenanceError("no_source_link", `A source with code ${parsed.code} is already registered.`);
    }
    const source = await insertSourceDocument(tx, { ...parsed, verification: "unverified" });
    await recordAuditEvent(tx, {
      action: "curriculum.source_registered",
      entityType: "source_document",
      entityId: source.id,
      actorProfileId,
      metadata: { sourceCode: source.code, provenance: source.provenance },
      requestId: context.requestId ?? null,
    });
    return source;
  });
}

export async function linkOutcomeSource(
  input: { versionId: string; outcomeId: string; sourceId: string; pageOrSection?: string | null },
  actorProfileId: string | null,
  context: CommandContext = {},
): Promise<{ linkId: string; created: boolean }> {
  const db = await resolveDb(context);
  const page = input.pageOrSection?.trim() || null;
  return db.transaction(async (tx) => {
    const { link, created, outcomeCode } = await linkOutcomeToSource(tx, {
      versionId: input.versionId,
      outcomeId: input.outcomeId,
      sourceId: input.sourceId,
      pageOrSection: page,
    });
    if (created) {
      await recordAuditEvent(tx, {
        action: "curriculum.outcome_source_linked",
        entityType: "curriculum_outcome",
        entityId: input.outcomeId,
        actorProfileId,
        metadata: { versionId: input.versionId, outcomeCode, sourceId: input.sourceId, hasPageReference: page !== null },
        requestId: context.requestId ?? null,
      });
    }
    return { linkId: link.id, created };
  });
}

/**
 * Marks an outcome verified. Needs a verifier profile id and a page or section on at least one
 * source link. When the outcome has none yet, the caller may pass `pageOrSection` and it is
 * recorded on the outcome's source in the same step. Nothing changes when a rule fails.
 */
export async function markOutcomeVerified(
  input: { versionId: string; outcomeId: string; verifierProfileId: string | null; pageOrSection?: string | null },
  context: CommandContext = {},
): Promise<{ outcomeCode: string; alreadyVerified: boolean }> {
  const db = await resolveDb(context);
  const page = input.pageOrSection?.trim() || null;
  return db.transaction(async (tx) => {
    await assertDraftVersion(tx, input.versionId);
    if (!(await getOutcomeInVersion(tx, input.versionId, input.outcomeId))) {
      throw new CurriculumNotFoundError("Outcome in this curriculum version");
    }

    const links = await listOutcomeLinks(tx, input.outcomeId);
    // A page typed by the verifier counts when the outcome has none yet; it is written only
    // after the rules pass.
    const pageToRecord = page && links.length > 0 && !links.some(hasPageReference) ? page : null;
    const effectiveLinks = pageToRecord
      ? links.map((link, index) => (index === 0 ? { ...link, pageOrSection: pageToRecord } : link))
      : links;
    const check = checkCanMarkVerified({ verifierProfileId: input.verifierProfileId, links: effectiveLinks });
    if (!check.ok) {
      throw new CurriculumProvenanceError(check.reason, check.message);
    }
    if (pageToRecord) {
      await attachPageReference(tx, { versionId: input.versionId, outcomeId: input.outcomeId, pageOrSection: pageToRecord });
    }

    const result = await setOutcomeVerified(tx, {
      versionId: input.versionId,
      outcomeId: input.outcomeId,
      verifierProfileId: input.verifierProfileId as string,
      at: context.now ?? new Date(),
    });
    await recordAuditEvent(tx, {
      action: "curriculum.outcome_verified",
      entityType: "curriculum_outcome",
      entityId: input.outcomeId,
      actorProfileId: input.verifierProfileId,
      metadata: { versionId: input.versionId, outcomeCode: result.outcomeCode, sourceLinkCount: links.length },
      requestId: context.requestId ?? null,
    });
    return result;
  });
}
