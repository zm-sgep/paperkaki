import { CurriculumImportError, validateCurriculumImport } from "@/domain/curriculum";
import type { Database } from "@/repositories/postgres/client";
import { findVersionByCode } from "@/repositories/postgres/curriculum";
import { importCurriculum } from "./import-curriculum";
import { publishCurriculumVersion, type PublishOptions } from "./publish-curriculum";

/**
 * Development seed (M1-05): imports a curriculum file and publishes it with unverified outcomes
 * allowed (ADR-0012). Development and test only: it refuses when NODE_ENV=production.
 * Safe to run again: a version that is already published is left alone.
 */

export class SeedRefusedError extends Error {
  constructor() {
    super(
      "Refusing to seed: NODE_ENV=production. The development seed publishes unverified curriculum (ADR-0012). " +
        "In production, import the file with `npm run curriculum:import`, have a named person verify each outcome, then publish.",
    );
    this.name = "SeedRefusedError";
  }
}

export type SeedResult =
  | { status: "seeded"; versionCode: string; outcomeCount: number; unverifiedCount: number }
  | { status: "already-published"; versionCode: string };

export async function seedDevelopmentCurriculum(
  input: unknown,
  options: { db: Database; nodeEnv?: string | undefined; logger?: PublishOptions["logger"] },
): Promise<SeedResult> {
  const nodeEnv = "nodeEnv" in options ? options.nodeEnv : process.env.NODE_ENV;
  if (nodeEnv === "production") {
    throw new SeedRefusedError();
  }

  const validation = validateCurriculumImport(input);
  if (!validation.ok) {
    throw new CurriculumImportError(validation.issues);
  }
  const versionCode = validation.curriculum.version.code;

  const existing = await findVersionByCode(options.db, versionCode);
  if (existing && existing.status !== "draft") {
    return { status: "already-published", versionCode };
  }

  await importCurriculum(input, { db: options.db });
  const version = await findVersionByCode(options.db, versionCode);
  if (!version) {
    throw new Error(`Curriculum version ${versionCode} was not created.`);
  }
  const published = await publishCurriculumVersion(
    version.id,
    { profileId: null },
    { db: options.db, allowUnverified: true, nodeEnv, logger: options.logger },
  );
  return {
    status: "seeded",
    versionCode,
    outcomeCount: published.outcomeCount,
    unverifiedCount: published.unverifiedCount,
  };
}
