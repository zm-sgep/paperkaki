import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import { printUploadPages, type PrintUploadPageRow } from "./schema";

/**
 * Persistence for the pages of a photographed paper. Reads and changes are always scoped by the
 * parent's profile id and the paper, and only pages that are not yet attached to an attempt can change.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPageId = (value: string): boolean => UUID.test(value);

export async function listDraftPages(db: Database, parentProfileId: string, paperId: string): Promise<PrintUploadPageRow[]> {
  return db
    .select()
    .from(printUploadPages)
    .where(and(eq(printUploadPages.parentProfileId, parentProfileId), eq(printUploadPages.paperId, paperId), isNull(printUploadPages.attemptId)))
    .orderBy(asc(printUploadPages.position), asc(printUploadPages.createdAt));
}

export async function listAttemptPages(db: Database, attemptId: string): Promise<PrintUploadPageRow[]> {
  return db.select().from(printUploadPages).where(eq(printUploadPages.attemptId, attemptId)).orderBy(asc(printUploadPages.position));
}

export async function insertDraftPage(db: Database, values: typeof printUploadPages.$inferInsert): Promise<PrintUploadPageRow> {
  const [row] = await db.insert(printUploadPages).values(values).returning();
  if (!row) throw new Error("Page was not stored.");
  return row;
}

export async function getDraftPage(db: Database, parentProfileId: string, paperId: string, pageId: string): Promise<PrintUploadPageRow | null> {
  if (!isPageId(pageId)) return null;
  const [row] = await db
    .select()
    .from(printUploadPages)
    .where(
      and(
        eq(printUploadPages.id, pageId),
        eq(printUploadPages.parentProfileId, parentProfileId),
        eq(printUploadPages.paperId, paperId),
        isNull(printUploadPages.attemptId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** A page by id for its owner, whether it is still a draft or has been attached to an attempt. */
export async function getOwnedPage(db: Database, parentProfileId: string, pageId: string): Promise<PrintUploadPageRow | null> {
  if (!isPageId(pageId)) return null;
  const [row] = await db
    .select()
    .from(printUploadPages)
    .where(and(eq(printUploadPages.id, pageId), eq(printUploadPages.parentProfileId, parentProfileId)))
    .limit(1);
  return row ?? null;
}

export async function deleteDraftPage(db: Database, pageId: string): Promise<void> {
  await db.delete(printUploadPages).where(and(eq(printUploadPages.id, pageId), isNull(printUploadPages.attemptId)));
}

export async function setDetectedPage(db: Database, pageId: string, detectedPage: number): Promise<void> {
  await db.update(printUploadPages).set({ detectedPage }).where(eq(printUploadPages.id, pageId));
}

/** Writes 1..n as the positions of these draft pages, in the order given. */
export async function setPositions(db: Database, orderedIds: readonly string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await db
      .update(printUploadPages)
      .set({ position: index + 1 })
      .where(and(eq(printUploadPages.id, id), isNull(printUploadPages.attemptId)));
  }
}

export async function attachPagesToAttempt(db: Database, parentProfileId: string, paperId: string, attemptId: string): Promise<number> {
  const rows = await db
    .update(printUploadPages)
    .set({ attemptId })
    .where(and(eq(printUploadPages.parentProfileId, parentProfileId), eq(printUploadPages.paperId, paperId), isNull(printUploadPages.attemptId)))
    .returning({ id: printUploadPages.id });
  return rows.length;
}

export async function countDraftPages(db: Database, parentProfileId: string, paperId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(printUploadPages)
    .where(and(eq(printUploadPages.parentProfileId, parentProfileId), eq(printUploadPages.paperId, paperId), isNull(printUploadPages.attemptId)));
  return row?.count ?? 0;
}
