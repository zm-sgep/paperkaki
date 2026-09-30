import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { children, parentProfiles } from "./identity";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

/**
 * Child mode is a constrained session under the parent account (docs/ARCHITECTURE.md section 13),
 * not an account of its own. One row per browser or iPad a parent has set up for a child.
 * Only a hash of the device key is stored; the key itself lives in the signed cookie. Deleting the
 * row ends that device's session at once.
 */
export const childDevices = pgTable(
  "child_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    parentProfileId: uuid("parent_profile_id")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    /** What the parent sees in the device list, e.g. "Darius's iPad". */
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("child_devices_token_hash_key").on(table.tokenHash),
    index("idx_child_devices_child").on(table.childId),
    index("idx_child_devices_parent").on(table.parentProfileId, table.createdAt),
    check("child_devices_label_length", sql`char_length(${table.label}) BETWEEN 1 AND 80`),
    check("child_devices_token_hash_shape", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

/**
 * The six-digit code a parent reads out to set up a child's device: valid for ten minutes, spent by
 * its first use, locked after five wrong guesses (src/domain/attempts/pairing.ts). Only a keyed
 * hash of the code is stored.
 */
export const childPairingCodes = pgTable(
  "child_pairing_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "restrict" }),
    parentProfileId: uuid("parent_profile_id")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    wrongTries: integer("wrong_tries").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_child_pairing_codes_hash").on(table.codeHash),
    index("idx_child_pairing_codes_child").on(table.childId),
    check("child_pairing_codes_wrong_tries", sql`${table.wrongTries} >= 0`),
  ],
);

export type ChildDevice = typeof childDevices.$inferSelect;
export type ChildPairingCode = typeof childPairingCodes.$inferSelect;
