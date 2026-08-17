import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { adminUsers } from "./auth.schema.js";

/** Lists the states used while one idempotent request is being processed or replayed. */
export const idempotencyStatusEnum = pgEnum("idempotency_status", [
  "PROCESSING",
  "COMPLETED",
]);

/** Stores completed mutation responses so retries cannot repeat stock effects. */
export const idempotencyRequests = pgTable(
  "idempotency_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 200 }).notNull(),
    method: varchar("method", { length: 16 }).notNull(),
    path: varchar("path", { length: 300 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: idempotencyStatusEnum("status").default("PROCESSING").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds the uniqueness and response-completeness rules for idempotent requests. */
  function buildIdempotencyConstraints(table) {
    return [
      uniqueIndex("idempotency_requests_key_unique").on(table.key),
      check(
        "idempotency_requests_key_not_blank_check",
        sql`length(trim(${table.key})) > 0`,
      ),
      check(
        "idempotency_requests_completed_response_check",
        sql`(${table.status} = 'PROCESSING' and ${table.responseStatus} is null and ${table.responseBody} is null) or (${table.status} = 'COMPLETED' and ${table.responseStatus} is not null and ${table.responseBody} is not null)`,
      ),
    ];
  },
);


/** Lists the final states stored for Module 15 import jobs. */
export const importJobStatusEnum = pgEnum("import_job_status", [
  "VALIDATED",
  "IMPORTED",
  "FAILED",
]);

/** Stores one uploaded import validation/confirmation job. */
export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 40 }).notNull(),
    status: importJobStatusEnum("status").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    totalRows: integer("total_rows").default(0).notNull(),
    validRows: integer("valid_rows").default(0).notNull(),
    errorRows: integer("error_rows").default(0).notNull(),
    importedRows: integer("imported_rows").default(0).notNull(),
    errorSummary: varchar("error_summary", { length: 500 }),
    validatedData: jsonb("validated_data").$type<Record<string, string>[] | null>(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  /** Adds simple integrity checks and list indexes for import jobs. */
  function buildImportJobConstraints(table) {
    return [
      index("import_jobs_type_status_index").on(table.type, table.status),
      index("import_jobs_started_at_index").on(table.startedAt),
      check(
        "import_jobs_type_not_blank_check",
        sql`length(trim(${table.type})) > 0`,
      ),
      check(
        "import_jobs_file_name_not_blank_check",
        sql`length(trim(${table.fileName})) > 0`,
      ),
      check(
        "import_jobs_row_totals_non_negative_check",
        sql`${table.totalRows} >= 0 and ${table.validRows} >= 0 and ${table.errorRows} >= 0 and ${table.importedRows} >= 0`,
      ),
      check(
        "import_jobs_row_counts_valid_check",
        sql`${table.validRows} + ${table.errorRows} <= ${table.totalRows} and ${table.importedRows} <= ${table.validRows}`,
      ),
    ];
  },
);

/** Stores precise row-level validation errors for one import job. */
export const importJobErrors = pgTable(
  "import_job_errors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importJobId: uuid("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    columnName: varchar("column_name", { length: 120 }).notNull(),
    errorCode: varchar("error_code", { length: 80 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    rawRow: jsonb("raw_row").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Keeps error rows valid and quick to load by import job. */
  function buildImportJobErrorConstraints(table) {
    return [
      index("import_job_errors_job_row_index").on(
        table.importJobId,
        table.rowNumber,
      ),
      check("import_job_errors_row_number_positive_check", sql`${table.rowNumber} > 0`),
      check(
        "import_job_errors_column_name_not_blank_check",
        sql`length(trim(${table.columnName})) > 0`,
      ),
      check(
        "import_job_errors_error_code_not_blank_check",
        sql`length(trim(${table.errorCode})) > 0`,
      ),
      check(
        "import_job_errors_message_not_blank_check",
        sql`length(trim(${table.message})) > 0`,
      ),
    ];
  },
);


/** Stores important admin actions for later read-only review in the System module. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id"),
    requestId: varchar("request_id", { length: 120 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    device: varchar("device", { length: 500 }),
    action: varchar("action", { length: 100 }).notNull(),
    entity: varchar("entity", { length: 100 }).notNull(),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Adds the admin relationship and indexes used by the audit-log list screen. */
  function buildAuditLogConstraints(table) {
    return [
      foreignKey({
        columns: [table.adminUserId],
        foreignColumns: [adminUsers.id],
        name: "audit_logs_admin_user_id_admin_users_id_fk",
      }).onDelete("restrict"),
      index("audit_logs_created_at_index").on(table.createdAt),
      index("audit_logs_action_created_at_index").on(table.action, table.createdAt),
      index("audit_logs_entity_created_at_index").on(table.entity, table.createdAt),
      check(
        "audit_logs_request_id_not_blank_check",
        sql`length(trim(${table.requestId})) > 0`,
      ),
      check(
        "audit_logs_action_not_blank_check",
        sql`length(trim(${table.action})) > 0`,
      ),
      check(
        "audit_logs_entity_not_blank_check",
        sql`length(trim(${table.entity})) > 0`,
      ),
    ];
  },
);
