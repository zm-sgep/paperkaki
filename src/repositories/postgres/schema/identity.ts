import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// Schema files use relative imports only: drizzle-kit loads them without the @/ alias.

export const userRole = pgEnum("user_role", ["parent", "admin"]);

/**
 * The parent/guardian account. It owns child profiles (added in a later milestone).
 * Provider-independent (ADR-0010): (auth_provider, auth_subject) identifies the
 * sign-in identity; nothing here is specific to one auth vendor.
 * No child data is stored on this table.
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

export type ParentProfile = typeof parentProfiles.$inferSelect;
export type NewParentProfile = typeof parentProfiles.$inferInsert;
