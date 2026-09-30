import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/repositories/postgres/client";
import { childDevices } from "@/repositories/postgres/schema";
import { getLastSelectedChildId, listActiveChildren } from "@/repositories/postgres/assessments";
import { getReadyDb } from "@/repositories/postgres/ready";

export type ChildSummary = { id: string; nickname: string };

export type ParentChildren = {
  children: ChildSummary[];
  /** The child the parent last picked, or the first child. Null when there are no children. */
  selectedChildId: string | null;
};

/** The parent's active children and which one is selected. Own children only. */
export async function getParentChildren(
  parentProfileId: string,
  context: { db?: Database } = {},
): Promise<ParentChildren> {
  const db = context.db ?? (await getReadyDb());
  const [rows, lastSelected] = await Promise.all([
    listActiveChildren(db, parentProfileId),
    getLastSelectedChildId(db, parentProfileId),
  ]);
  const list = rows.map((row) => ({ id: row.id, nickname: row.nickname }));
  const selected = list.find((child) => child.id === lastSelected) ?? list[0] ?? null;
  return { children: list, selectedChildId: selected?.id ?? null };
}

export type ChildDeviceSummary = { id: string; childId: string; label: string };

/** The devices this parent has set up, oldest first. Own children only. */
export async function listChildDevices(parentProfileId: string, context: { db?: Database } = {}): Promise<ChildDeviceSummary[]> {
  const db = context.db ?? (await getReadyDb());
  const rows = await db
    .select({ id: childDevices.id, childId: childDevices.childId, label: childDevices.label })
    .from(childDevices)
    .where(and(eq(childDevices.parentProfileId, parentProfileId), isNull(childDevices.revokedAt)))
    .orderBy(asc(childDevices.createdAt));
  return rows;
}
