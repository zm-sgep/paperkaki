import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

export const userRole = pgEnum("user_role", ["parent", "admin"]);

/**
 * The parent/guardian account. It owns the child profiles in `children` (below).
 * Provider-independent (ADR-0010): (auth_provider, auth_subject) identifies the
 * sign-in identity; nothing here is specific to one auth vendor.
 * No child data is stored on this table apart from a pointer to the last selected child.
 */
export const parentProfiles = pgTable(
  "parent_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authProvider: text("auth_provider").notNull(),
    authSubject: text("auth_subject").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    role: userRole("role").notNull().default("parent"),
    /**
     * A durable preference (DATA_MODEL "UX State"): the child the parent last picked in the top bar.
     * Cleared, not cascaded, if the child row were ever deleted. Children are archived, not deleted.
     */
    lastSelectedChildId: uuid("last_selected_child_id").references((): AnyPgColumn => children.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("parent_profiles_auth_identity_key").on(table.authProvider, table.authSubject),
  ],
);

export const childLevel = pgEnum("child_level", ["P1", "P2", "P3", "P4", "P5", "P6"]);

/**
 * A child profile, owned by the parent/guardian. Deliberately minimal (CLAUDE.md privacy):
 * a nickname, a level, an optional free-text school name and the school year. No date of birth,
 * NRIC, student ID or address. Archived children are hidden, never deleted, so history survives.
 */
export const children = pgTable(
  "children",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentProfileId: uuid("parent_profile_id")
      .notNull()
      .references(() => parentProfiles.id, { onDelete: "restrict" }),
    nickname: text("nickname").notNull(),
    level: childLevel("level").notNull(),
    schoolName: text("school_name"),
    academicYear: integer("academic_year").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_children_parent").on(table.parentProfileId, table.createdAt),
    check("children_nickname_length", sql`char_length(${table.nickname}) BETWEEN 1 AND 30`),
    check("children_academic_year_range", sql`${table.academicYear} BETWEEN 2020 AND 2100`),
  ],
);

export type ParentProfile = typeof parentProfiles.$inferSelect;
export type NewParentProfile = typeof parentProfiles.$inferInsert;
export type Child = typeof children.$inferSelect;
export type NewChild = typeof children.$inferInsert;
