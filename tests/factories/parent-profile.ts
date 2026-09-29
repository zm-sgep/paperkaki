import type { Database } from "@/repositories/postgres/client";
import { parentProfiles, type NewParentProfile, type ParentProfile } from "@/repositories/postgres/schema";

/**
 * Deterministic, obviously fictional parent profiles: "Test Parent A",
 * parent-a@example.test. The same key always yields the same values.
 * Never put real names, emails or child details in tests.
 */
export function buildParentProfile(
  key = "A",
  overrides: Partial<NewParentProfile> = {},
): NewParentProfile {
  const letter = key.toUpperCase();
  const lower = letter.toLowerCase();
  const serial = letter.charCodeAt(0).toString(16).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${serial}`,
    authProvider: "test",
    authSubject: `test-subject-${lower}`,
    email: `parent-${lower}@example.test`,
    displayName: `Test Parent ${letter}`,
    role: "parent",
    ...overrides,
  };
}

export async function insertParentProfile(
  db: Database,
  key = "A",
  overrides: Partial<NewParentProfile> = {},
): Promise<ParentProfile> {
  const [row] = await db.insert(parentProfiles).values(buildParentProfile(key, overrides)).returning();
  if (!row) {
    throw new Error("Factory insert returned no row.");
  }
  return row;
}
