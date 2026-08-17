import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Stores the one Admin/Counter Operator account allowed in version 1. */
export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    singletonKey: integer("singleton_key").default(1).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // Builds singleton, normalized-email and required-text protections.
  function buildAdminUserConstraints(table) {
    return [
      unique("admin_users_singleton_key_unique").on(table.singletonKey),
      unique("admin_users_email_unique").on(table.email),
      check(
        "admin_users_singleton_key_check",
        sql`${table.singletonKey} = 1`,
      ),
      check(
        "admin_users_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
      check(
        "admin_users_email_not_blank_check",
        sql`length(trim(${table.email})) > 0`,
      ),
      check(
        "admin_users_email_normalized_check",
        sql`${table.email} = lower(trim(${table.email}))`,
      ),
      check(
        "admin_users_password_hash_not_blank_check",
        sql`length(trim(${table.passwordHash})) > 0`,
      ),
    ];
  },
);

/** Stores refresh-session state so logout and password change can revoke access. */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id").notNull(),
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // Builds the relationship, lookup indexes and session timestamp protections.
  function buildAdminSessionConstraints(table) {
    return [
      foreignKey({
        columns: [table.adminUserId],
        foreignColumns: [adminUsers.id],
        name: "admin_sessions_admin_user_id_admin_users_id_fk",
      }).onDelete("restrict"),
      index("admin_sessions_admin_user_id_index").on(table.adminUserId),
      unique("admin_sessions_refresh_token_hash_unique").on(
        table.refreshTokenHash,
      ),
      check(
        "admin_sessions_refresh_token_hash_format_check",
        sql`${table.refreshTokenHash} ~ '^[0-9a-f]{64}$'`,
      ),
      check(
        "admin_sessions_expiry_after_creation_check",
        sql`${table.expiresAt} > ${table.createdAt}`,
      ),
      check(
        "admin_sessions_revocation_after_creation_check",
        sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`,
      ),
      check(
        "admin_sessions_last_use_after_creation_check",
        sql`${table.lastUsedAt} >= ${table.createdAt}`,
      ),
    ];
  },
);
