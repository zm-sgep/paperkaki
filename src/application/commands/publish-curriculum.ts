import { decidePublish, type PublishDecision } from "@/domain/curriculum";
import { recordAuditEvent } from "@/lib/audit";
import { logger as appLogger } from "@/lib/logger";
import type { Database } from "@/repositories/postgres/client";
import { listPublishCandidates } from "@/repositories/postgres/curriculum";
import { assertDraftVersion, setVersionPublished } from "@/repositories/postgres/curriculum-write";
import { getReadyDb } from "@/repositories/postgres/ready";

/**
 * Publishes a draft curriculum version (M1-05, ADR-0003, ADR-0012). Publishing freezes it.
 *
 *  - Every outcome needs at least one source link (never overridable).
 *  - Unverified outcomes refuse publishing unless `allowUnverified` is true AND the environment
 *    is not production. When they are allowed through, a warning names how many.
 */

export type PublishActor = { profileId: string | null };

export type PublishOptions = {
  /** Development escape hatch (ADR-0012). Ignored, and refused, in production. */
  allowUnverified?: boolean;
  /** Defaults to process.env.NODE_ENV. Tests pass it to exercise production behaviour. */
  nodeEnv?: string | undefined;
  db?: Database;
  logger?: { warn: (fields: Record<string, unknown>, message: string) => void };
  requestId?: string | null;
  now?: Date;
};

export type PublishResult = PublishDecision & { versionId: string; versionCode: string; outcomeCount: number };

export async function publishCurriculumVersion(
  versionId: string,
  actor: PublishActor,
  options: PublishOptions = {},
): Promise<PublishResult> {
  const db = options.db ?? (await getReadyDb());
  const nodeEnv = "nodeEnv" in options ? options.nodeEnv : process.env.NODE_ENV;
  const allowUnverified = options.allowUnverified === true;

  const result = await db.transaction(async (tx) => {
    const draft = await assertDraftVersion(tx, versionId);
    const outcomes = await listPublishCandidates(tx, versionId);
    const decision = decidePublish({ outcomes, allowUnverified, nodeEnv });

    await setVersionPublished(tx, { versionId, publishedBy: actor.profileId, at: options.now ?? new Date() });
    await recordAuditEvent(tx, {
      action: "curriculum.published",
      entityType: "curriculum_version",
      entityId: versionId,
      actorProfileId: actor.profileId,
      metadata: {
        versionCode: draft.code,
        outcomeCount: outcomes.length,
        unverifiedCount: decision.unverifiedCount,
        allowedUnverified: decision.unverifiedCount > 0,
      },
      requestId: options.requestId ?? null,
    });
    return { ...decision, versionId, versionCode: draft.code, outcomeCount: outcomes.length };
  });

  if (result.unverifiedCount > 0) {
    (options.logger ?? appLogger).warn(
      { versionId, versionCode: result.versionCode, unverifiedCount: result.unverifiedCount },
      `Published curriculum ${result.versionCode} with ${result.unverifiedCount} unverified outcome(s). Development only (ADR-0012).`,
    );
  }
  return result;
}
