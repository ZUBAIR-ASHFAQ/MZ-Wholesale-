import { asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  businessSettings,
  documentSequences,
} from "../../database/schema/index.js";
import type {
  DocumentSequenceInput,
  DocumentType,
} from "./business-settings.schema.js";

/** Contains the database methods used by this repository. */
export type BusinessSettingsDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update" | "execute"
>;

/** Represents one saved business-settings row. */
export type BusinessSettingsRecord = typeof businessSettings.$inferSelect;

/** Contains fields accepted when creating the singleton settings record. */
export type NewBusinessSettings = typeof businessSettings.$inferInsert;

/** Contains fields that may be changed on the settings record. */
export interface BusinessSettingsChanges {
  businessName?: string;
  phone?: string;
  email?: string | null;
  address?: string;
  logoUrl?: string | null;
}

/** Represents one saved document-sequence row. */
export type DocumentSequenceRecord = typeof documentSequences.$inferSelect;

/** Contains the value returned after a number is reserved. */
export interface ReservedDocumentNumber {
  prefix: string;
  number: number;
}

/** Reads the singleton business-settings record. */
export async function findBusinessSettings(
  database: BusinessSettingsDatabase,
): Promise<BusinessSettingsRecord | null> {
  const rows = await database
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.singletonKey, 1))
    .limit(1);
  return rows[0] ?? null;
}

/** Reads all document sequences in a stable document-type order. */
export async function findDocumentSequences(
  database: BusinessSettingsDatabase,
): Promise<DocumentSequenceRecord[]> {
  return database
    .select()
    .from(documentSequences)
    .orderBy(asc(documentSequences.documentType));
}

/** Serializes Business Settings saves, including the first setup with no row to lock. */
export async function lockBusinessSettingsSave(
  database: BusinessSettingsDatabase,
): Promise<void> {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('wholesale_erp_business_settings_save', 0))`,
  );
}

/** Locks the singleton row while a transaction changes its settings. */
export async function lockBusinessSettings(
  database: BusinessSettingsDatabase,
): Promise<BusinessSettingsRecord | null> {
  const rows = await database
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.singletonKey, 1))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Creates the one allowed business-settings record. */
export async function createBusinessSettings(
  database: BusinessSettingsDatabase,
  input: NewBusinessSettings,
): Promise<BusinessSettingsRecord | null> {
  const rows = await database
    .insert(businessSettings)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Updates allowed business fields and refreshes the update timestamp. */
export async function updateBusinessSettings(
  database: BusinessSettingsDatabase,
  changes: BusinessSettingsChanges,
): Promise<BusinessSettingsRecord | null> {
  const rows = await database
    .update(businessSettings)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(businessSettings.singletonKey, 1))
    .returning();

  return rows[0] ?? null;
}

/** Creates the initial set of document sequences. */
export async function createDocumentSequences(
  database: BusinessSettingsDatabase,
  sequences: DocumentSequenceInput[],
): Promise<DocumentSequenceRecord[]> {
  return database.insert(documentSequences).values(sequences).returning();
}

/** Locks one sequence before a transaction validates or changes it. */
export async function lockDocumentSequence(
  database: BusinessSettingsDatabase,
  documentType: DocumentType,
): Promise<DocumentSequenceRecord | null> {
  const rows = await database
    .select()
    .from(documentSequences)
    .where(eq(documentSequences.documentType, documentType))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Updates an approved sequence after the service validates the change. */
export async function updateDocumentSequence(
  database: BusinessSettingsDatabase,
  sequence: DocumentSequenceInput,
): Promise<DocumentSequenceRecord | null> {
  const rows = await database
    .update(documentSequences)
    .set({
      prefix: sequence.prefix,
      nextNumber: sequence.nextNumber,
      updatedAt: new Date(),
    })
    .where(eq(documentSequences.documentType, sequence.documentType))
    .returning();

  return rows[0] ?? null;
}

/**
 * Atomically reserves one number and increments the stored next number.
 * PostgreSQL locks the updated row, so concurrent callers cannot get duplicates.
 */
export async function reserveNextDocumentNumber(
  database: BusinessSettingsDatabase,
  documentType: DocumentType,
): Promise<ReservedDocumentNumber | null> {
  const rows = await database
    .update(documentSequences)
    .set({
      nextNumber: sql`${documentSequences.nextNumber} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(documentSequences.documentType, documentType))
    .returning({
      prefix: documentSequences.prefix,
      number: sql<number>`${documentSequences.nextNumber} - 1`,
    });

  return rows[0] ?? null;
}
