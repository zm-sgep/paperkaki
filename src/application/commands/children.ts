import { InputError, NotFoundError } from "@/application/errors";
import { todayInSingapore } from "@/domain/assessments/dates";
import { recordAuditEvent } from "@/lib/audit";
import type { Database } from "@/repositories/postgres/client";
import {
  archiveOwnedChild,
  getOwnedChild,
  getLastSelectedChildId,
  insertChild,
  setLastSelectedChildId,
  updateOwnedChild,
} from "@/repositories/postgres/assessments";
import { getReadyDb } from "@/repositories/postgres/ready";
import type { Child } from "@/repositories/postgres/schema";
import {
  CreateChildInputSchema,
  UpdateChildInputSchema,
  fieldErrorsOf,
  type CreateChildInput,
  type UpdateChildInput,
} from "@/schemas/assessment-setup";

/**
 * Child profile commands (M3-01). The parent owns the profile. Every command takes the signed-in
 * parent's id and only ever touches that parent's children; anything else is "not found".
 * Only a nickname, level, optional school name and school year are stored.
 */

export type CommandContext = { db?: Database; requestId?: string | null; now?: Date };

export async function resolveCommandDb(context: CommandContext): Promise<Database> {
  return context.db ?? (await getReadyDb());
}

export async function createChildInTransaction(
  db: Database,
  parentProfileId: string,
  input: CreateChildInput,
  context: CommandContext,
): Promise<Child> {
  const parsed = CreateChildInputSchema.safeParse(input);
  if (!parsed.success) throw new InputError(fieldErrorsOf(parsed.error));
  const child = await insertChild(db, {
    parentProfileId,
    nickname: parsed.data.nickname,
    level: parsed.data.level,
    schoolName: parsed.data.schoolName,
    academicYear: Number(todayInSingapore(context.now).slice(0, 4)),
  });
  // The first child is selected automatically; later ones do not steal the selection.
  if ((await getLastSelectedChildId(db, parentProfileId)) === null) {
    await setLastSelectedChildId(db, parentProfileId, child.id);
  }
  await recordAuditEvent(db, {
    action: "child.created",
    entityType: "child",
    entityId: child.id,
    actorProfileId: parentProfileId,
    metadata: { level: child.level },
    requestId: context.requestId ?? null,
  });
  return child;
}

export async function createChild(parentProfileId: string, input: CreateChildInput, context: CommandContext = {}): Promise<Child> {
  const db = await resolveCommandDb(context);
  return db.transaction((tx) => createChildInTransaction(tx, parentProfileId, input, context));
}

export async function updateChild(
  parentProfileId: string,
  childId: string,
  input: UpdateChildInput,
  context: CommandContext = {},
): Promise<Child> {
  const db = await resolveCommandDb(context);
  const parsed = UpdateChildInputSchema.safeParse(input);
  if (!parsed.success) throw new InputError(fieldErrorsOf(parsed.error));
  const row = await updateOwnedChild(db, parentProfileId, childId, parsed.data);
  if (!row) throw new NotFoundError();
  return row;
}

/** Hides the child and their assessments from the family screens. Nothing is deleted. */
export async function archiveChild(parentProfileId: string, childId: string, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  await db.transaction(async (tx) => {
    const row = await archiveOwnedChild(tx, parentProfileId, childId, context.now ?? new Date());
    if (!row) throw new NotFoundError();
    if ((await getLastSelectedChildId(tx, parentProfileId)) === childId) {
      await setLastSelectedChildId(tx, parentProfileId, null);
    }
    await recordAuditEvent(tx, {
      action: "child.archived",
      entityType: "child",
      entityId: childId,
      actorProfileId: parentProfileId,
      requestId: context.requestId ?? null,
    });
  });
}

/** Remembers which child the parent is looking at (a durable preference, not navigation). */
export async function selectChild(parentProfileId: string, childId: string, context: CommandContext = {}): Promise<void> {
  const db = await resolveCommandDb(context);
  await selectChildInTransaction(db, parentProfileId, childId);
}

export async function selectChildInTransaction(db: Database, parentProfileId: string, childId: string): Promise<void> {
  const child = await getOwnedChild(db, parentProfileId, childId);
  if (!child || child.archivedAt) throw new NotFoundError();
  await setLastSelectedChildId(db, parentProfileId, childId);
}
