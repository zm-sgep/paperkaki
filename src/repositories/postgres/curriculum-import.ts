import { and, eq, inArray } from "drizzle-orm";
import { CurriculumVersionLockedError, type NormalizedCurriculum } from "@/domain/curriculum";
import type { Database } from "./client";
import { findSourceByCode, insertSourceDocument, updateSourceDocumentIfChanged } from "./curriculum-write";
import {
  curriculumDomains,
  curriculumOutcomeSources,
  curriculumOutcomes,
  curriculumTopics,
  curriculumVersions,
  outcomeRelationships,
  subjects,
} from "./schema";

/**
 * Writes a normalised curriculum file into one DRAFT version, matching rows by code. Running it
 * again with the same content changes nothing. Call it inside a transaction: it makes many
 * writes that must succeed or fail together.
 *
 * The file is the source of truth for a draft: rows in the draft that the file no longer lists
 * are removed (their source links and relationships first). Published and retired versions are
 * never touched (CurriculumVersionLockedError).
 */

export type EntityCounts = { created: number; updated: number; removed: number };

export type ImportSummary = {
  versionId: string;
  versionCode: string;
  versionCreated: boolean;
  /** False when the database already matched the file exactly. */
  changed: boolean;
  sources: EntityCounts;
  domains: EntityCounts;
  topics: EntityCounts;
  outcomes: EntityCounts;
  sourceLinks: EntityCounts;
  relationships: EntityCounts;
  /** Outcomes whose wording changed and so lost a previous verification. */
  verificationReset: number;
};

const empty = (): EntityCounts => ({ created: 0, updated: 0, removed: 0 });
const touched = (counts: EntityCounts) => counts.created + counts.updated + counts.removed > 0;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function ensureSubject(db: Database, name: string): Promise<string> {
  const [existing] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.name, name)).limit(1);
  if (existing) {
    return existing.id;
  }
  const [created] = await db.insert(subjects).values({ code: slug(name), name }).returning({ id: subjects.id });
  if (!created) {
    throw new Error("Subject was not stored.");
  }
  return created.id;
}

const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export async function applyCurriculumImport(db: Database, data: NormalizedCurriculum): Promise<ImportSummary> {
  const summary: ImportSummary = {
    versionId: "",
    versionCode: data.version.code,
    versionCreated: false,
    changed: false,
    sources: empty(),
    domains: empty(),
    topics: empty(),
    outcomes: empty(),
    sourceLinks: empty(),
    relationships: empty(),
    verificationReset: 0,
  };

  // Version: find or create; refuse anything that is not a draft before writing a single row.
  const [existingVersion] = await db
    .select()
    .from(curriculumVersions)
    .where(eq(curriculumVersions.code, data.version.code))
    .limit(1);
  if (existingVersion && existingVersion.status !== "draft") {
    throw new CurriculumVersionLockedError(existingVersion.code, existingVersion.status);
  }

  const subjectId = await ensureSubject(db, data.version.subject);

  // Sources are shared across versions; upsert them by code.
  const sourceIds = new Map<string, string>();
  for (const source of data.sources) {
    const input = {
      code: source.key,
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      provenance: source.provenance,
      verification: source.verification,
      accessedOn: source.accessedOn,
      notes: source.notes,
    };
    const existing = await findSourceByCode(db, source.key);
    if (!existing) {
      sourceIds.set(source.key, (await insertSourceDocument(db, input)).id);
      summary.sources.created += 1;
    } else {
      sourceIds.set(source.key, existing.id);
      if (await updateSourceDocumentIfChanged(db, existing, input)) {
        summary.sources.updated += 1;
      }
    }
  }

  let versionId: string;
  if (!existingVersion) {
    const [created] = await db
      .insert(curriculumVersions)
      .values({
        code: data.version.code,
        subjectId,
        title: data.version.title,
        levels: data.version.levels,
        effectiveFrom: data.version.effectiveFrom,
        status: "draft",
      })
      .returning({ id: curriculumVersions.id });
    if (!created) {
      throw new Error("Curriculum version was not stored.");
    }
    versionId = created.id;
    summary.versionCreated = true;
  } else {
    versionId = existingVersion.id;
    if (
      existingVersion.subjectId !== subjectId ||
      existingVersion.title !== data.version.title ||
      existingVersion.effectiveFrom !== data.version.effectiveFrom ||
      !sameList(existingVersion.levels, data.version.levels)
    ) {
      await db
        .update(curriculumVersions)
        .set({
          subjectId,
          title: data.version.title,
          levels: data.version.levels,
          effectiveFrom: data.version.effectiveFrom,
        })
        .where(eq(curriculumVersions.id, versionId));
      summary.changed = true;
    }
  }
  summary.versionId = versionId;

  // Existing rows of the draft, by code.
  const domainRows = new Map(
    (await db.select().from(curriculumDomains).where(eq(curriculumDomains.curriculumVersionId, versionId))).map((row) => [row.code, row]),
  );
  const topicRows = new Map(
    (await db.select().from(curriculumTopics).where(eq(curriculumTopics.curriculumVersionId, versionId))).map((row) => [row.code, row]),
  );
  const outcomeRows = new Map(
    (await db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.curriculumVersionId, versionId))).map((row) => [row.code, row]),
  );

  const wantedDomainCodes = new Set(data.domains.map((domain) => domain.code));
  const wantedTopicCodes = new Set(data.domains.flatMap((domain) => domain.topics.map((topic) => topic.code)));
  const wantedOutcomeCodes = new Set(
    data.domains.flatMap((domain) => domain.topics.flatMap((topic) => topic.outcomes.map((outcome) => outcome.code))),
  );

  // Remove what the file dropped, children first.
  const removedOutcomeIds = [...outcomeRows.values()].filter((row) => !wantedOutcomeCodes.has(row.code)).map((row) => row.id);
  if (removedOutcomeIds.length > 0) {
    const droppedFrom = await db
      .delete(outcomeRelationships)
      .where(inArray(outcomeRelationships.fromOutcomeId, removedOutcomeIds))
      .returning({ id: outcomeRelationships.fromOutcomeId });
    const droppedTo = await db
      .delete(outcomeRelationships)
      .where(inArray(outcomeRelationships.toOutcomeId, removedOutcomeIds))
      .returning({ id: outcomeRelationships.toOutcomeId });
    summary.relationships.removed += droppedFrom.length + droppedTo.length;
    const droppedLinks = await db
      .delete(curriculumOutcomeSources)
      .where(inArray(curriculumOutcomeSources.outcomeId, removedOutcomeIds))
      .returning({ id: curriculumOutcomeSources.id });
    summary.sourceLinks.removed += droppedLinks.length;
    await db.delete(curriculumOutcomes).where(inArray(curriculumOutcomes.id, removedOutcomeIds));
    summary.outcomes.removed += removedOutcomeIds.length;
  }
  const removedTopicIds = [...topicRows.values()].filter((row) => !wantedTopicCodes.has(row.code)).map((row) => row.id);
  if (removedTopicIds.length > 0) {
    await db.delete(curriculumTopics).where(inArray(curriculumTopics.id, removedTopicIds));
    summary.topics.removed += removedTopicIds.length;
  }
  const removedDomainIds = [...domainRows.values()].filter((row) => !wantedDomainCodes.has(row.code)).map((row) => row.id);
  if (removedDomainIds.length > 0) {
    await db.delete(curriculumDomains).where(inArray(curriculumDomains.id, removedDomainIds));
    summary.domains.removed += removedDomainIds.length;
  }

  // Domains, topics, outcomes: insert new, update changed.
  const outcomeIds = new Map<string, string>();
  const desiredLinks = new Map<string, Set<string>>();

  for (const domain of data.domains) {
    let domainId: string;
    const existingDomain = domainRows.get(domain.code);
    if (!existingDomain) {
      const [created] = await db
        .insert(curriculumDomains)
        .values({ curriculumVersionId: versionId, code: domain.code, title: domain.title, sortOrder: domain.sortOrder })
        .returning({ id: curriculumDomains.id });
      if (!created) throw new Error("Domain was not stored.");
      domainId = created.id;
      summary.domains.created += 1;
    } else {
      domainId = existingDomain.id;
      if (existingDomain.title !== domain.title || existingDomain.sortOrder !== domain.sortOrder) {
        await db
          .update(curriculumDomains)
          .set({ title: domain.title, sortOrder: domain.sortOrder })
          .where(eq(curriculumDomains.id, domainId));
        summary.domains.updated += 1;
      }
    }

    for (const topic of domain.topics) {
      let topicId: string;
      const existingTopic = topicRows.get(topic.code);
      if (!existingTopic) {
        const [created] = await db
          .insert(curriculumTopics)
          .values({
            curriculumVersionId: versionId,
            domainId,
            code: topic.code,
            title: topic.title,
            parentLabel: topic.parentLabel,
            level: topic.level,
            sortOrder: topic.sortOrder,
            scopeNotes: topic.scopeNotes,
          })
          .returning({ id: curriculumTopics.id });
        if (!created) throw new Error("Topic was not stored.");
        topicId = created.id;
        summary.topics.created += 1;
      } else {
        topicId = existingTopic.id;
        if (
          existingTopic.domainId !== domainId ||
          existingTopic.title !== topic.title ||
          existingTopic.parentLabel !== topic.parentLabel ||
          existingTopic.level !== topic.level ||
          existingTopic.sortOrder !== topic.sortOrder ||
          !sameList(existingTopic.scopeNotes, topic.scopeNotes)
        ) {
          await db
            .update(curriculumTopics)
            .set({
              domainId,
              title: topic.title,
              parentLabel: topic.parentLabel,
              level: topic.level,
              sortOrder: topic.sortOrder,
              scopeNotes: topic.scopeNotes,
            })
            .where(eq(curriculumTopics.id, topicId));
          summary.topics.updated += 1;
        }
      }

      for (const outcome of topic.outcomes) {
        let outcomeId: string;
        const existingOutcome = outcomeRows.get(outcome.code);
        if (!existingOutcome) {
          const [created] = await db
            .insert(curriculumOutcomes)
            .values({
              curriculumVersionId: versionId,
              topicId,
              code: outcome.code,
              statement: outcome.statement,
              childLabel: outcome.childLabel,
              level: outcome.level,
              sortOrder: outcome.sortOrder,
            })
            .returning({ id: curriculumOutcomes.id });
          if (!created) throw new Error("Outcome was not stored.");
          outcomeId = created.id;
          summary.outcomes.created += 1;
        } else {
          outcomeId = existingOutcome.id;
          const wordingChanged = existingOutcome.statement !== outcome.statement;
          if (
            wordingChanged ||
            existingOutcome.topicId !== topicId ||
            existingOutcome.childLabel !== outcome.childLabel ||
            existingOutcome.level !== outcome.level ||
            existingOutcome.sortOrder !== outcome.sortOrder
          ) {
            // A person verified the old wording; changed wording needs a fresh check.
            const resetVerification = wordingChanged && existingOutcome.verification === "verified";
            await db
              .update(curriculumOutcomes)
              .set({
                topicId,
                statement: outcome.statement,
                childLabel: outcome.childLabel,
                level: outcome.level,
                sortOrder: outcome.sortOrder,
                ...(resetVerification ? { verification: "unverified" as const, verifiedBy: null, verifiedAt: null } : {}),
              })
              .where(eq(curriculumOutcomes.id, outcomeId));
            summary.outcomes.updated += 1;
            if (resetVerification) {
              summary.verificationReset += 1;
            }
          }
        }
        outcomeIds.set(outcome.code, outcomeId);

        const wanted = new Set<string>();
        for (const ref of outcome.sourceRefs) {
          const sourceId = sourceIds.get(ref.sourceKey);
          if (!sourceId) {
            throw new Error(`Source ${ref.sourceKey} was not registered.`);
          }
          wanted.add(`${sourceId}|${ref.pageOrSection ?? ""}`);
        }
        desiredLinks.set(outcomeId, wanted);
      }
    }
  }

  // Source links: make each outcome's links exactly what the file says.
  const linkOutcomeIds = [...outcomeIds.values()];
  const existingLinks =
    linkOutcomeIds.length === 0
      ? []
      : await db.select().from(curriculumOutcomeSources).where(inArray(curriculumOutcomeSources.outcomeId, linkOutcomeIds));
  const linkKey = (sourceId: string, page: string | null) => `${sourceId}|${page ?? ""}`;
  const haveLinks = new Set<string>();
  const staleLinkIds: string[] = [];
  for (const link of existingLinks) {
    const key = `${link.outcomeId}#${linkKey(link.sourceId, link.pageOrSection)}`;
    if (desiredLinks.get(link.outcomeId)?.has(linkKey(link.sourceId, link.pageOrSection))) {
      haveLinks.add(key);
    } else {
      staleLinkIds.push(link.id);
    }
  }
  if (staleLinkIds.length > 0) {
    await db.delete(curriculumOutcomeSources).where(inArray(curriculumOutcomeSources.id, staleLinkIds));
    summary.sourceLinks.removed += staleLinkIds.length;
  }
  const newLinks: (typeof curriculumOutcomeSources.$inferInsert)[] = [];
  for (const domain of data.domains) {
    for (const topic of domain.topics) {
      for (const outcome of topic.outcomes) {
        const outcomeId = outcomeIds.get(outcome.code) as string;
        for (const ref of outcome.sourceRefs) {
          const sourceId = sourceIds.get(ref.sourceKey) as string;
          if (!haveLinks.has(`${outcomeId}#${linkKey(sourceId, ref.pageOrSection)}`)) {
            haveLinks.add(`${outcomeId}#${linkKey(sourceId, ref.pageOrSection)}`);
            newLinks.push({ outcomeId, sourceId, pageOrSection: ref.pageOrSection });
          }
        }
      }
    }
  }
  if (newLinks.length > 0) {
    await db.insert(curriculumOutcomeSources).values(newLinks);
    summary.sourceLinks.created += newLinks.length;
  }

  // Relationships between outcomes of this version.
  const versionOutcomeIds = linkOutcomeIds;
  const existingRelationships =
    versionOutcomeIds.length === 0
      ? []
      : await db.select().from(outcomeRelationships).where(inArray(outcomeRelationships.fromOutcomeId, versionOutcomeIds));
  const relKey = (from: string, to: string, kind: string) => `${from}>${to}:${kind}`;
  const wantedRelationships = new Map(
    data.relationships.map((relationship) => {
      const from = outcomeIds.get(relationship.from) as string;
      const to = outcomeIds.get(relationship.to) as string;
      return [relKey(from, to, relationship.kind), { fromOutcomeId: from, toOutcomeId: to, kind: relationship.kind }] as const;
    }),
  );
  const haveRelationships = new Set<string>();
  for (const relationship of existingRelationships) {
    const key = relKey(relationship.fromOutcomeId, relationship.toOutcomeId, relationship.kind);
    if (wantedRelationships.has(key)) {
      haveRelationships.add(key);
    } else {
      await db
        .delete(outcomeRelationships)
        .where(
          and(
            eq(outcomeRelationships.fromOutcomeId, relationship.fromOutcomeId),
            eq(outcomeRelationships.toOutcomeId, relationship.toOutcomeId),
            eq(outcomeRelationships.kind, relationship.kind),
          ),
        );
      summary.relationships.removed += 1;
    }
  }
  const newRelationships = [...wantedRelationships.entries()].filter(([key]) => !haveRelationships.has(key)).map(([, value]) => value);
  if (newRelationships.length > 0) {
    await db.insert(outcomeRelationships).values(newRelationships);
    summary.relationships.created += newRelationships.length;
  }

  summary.changed =
    summary.changed ||
    summary.versionCreated ||
    [summary.sources, summary.domains, summary.topics, summary.outcomes, summary.sourceLinks, summary.relationships].some(touched);
  return summary;
}
