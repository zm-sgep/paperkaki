import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "@/repositories/postgres/client";

describe("createDatabase with file-backed PGlite", () => {
  const root = mkdtempSync(path.join(tmpdir(), "paperkaki-db-"));

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates missing parent folders, as on a fresh clone without .data/", async () => {
    const location = path.join(root, "not-yet", "created", "dev");
    const handle = createDatabase(`pglite://${location}`);
    const result = (await handle.db.execute(sql`select 1 as one`)) as { rows: unknown[] };
    expect(result.rows[0]).toEqual({ one: 1 });
    await handle.close();
  });
});
