import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { AppError } from "../../shared/errors/app-error.js";

import {
  createBusinessSettings,
  createDocumentSequences,
  findBusinessSettings,
  findDocumentSequences,
  lockBusinessSettings,
  lockBusinessSettingsSave,
  lockDocumentSequence,
  reserveNextDocumentNumber,
  updateBusinessSettings,
  updateDocumentSequence,
  type BusinessSettingsChanges,
  type BusinessSettingsDatabase,
  type BusinessSettingsRecord,
  type DocumentSequenceRecord,
  type NewBusinessSettings,
  type ReservedDocumentNumber,
} from "./business-settings.repository.js";
import {
  parseBusinessSettingsSetup,
  parseBusinessSettingsUpdate,
  type BusinessSettingsSetupInput,
  type BusinessSettingsUpdateInput,
  type DocumentSequenceInput,
  type DocumentType,
} from "./business-settings.schema.js";

/** Contains the complete Business Settings response returned to routes and startup commands. */
export interface BusinessSettingsView {
  isConfigured: boolean;
  settings: BusinessSettingsRecord | null;
  sequences: DocumentSequenceRecord[];
}

/** Creates one safe Business Settings error for the shared error handler. */
function createServiceError(
  code: string,
  message: string,
  statusCode: number,
): AppError {
  return new AppError(code, message, statusCode);
}

/** Reads the complete business settings view. */
export async function getBusinessSettingsView(
  database: BusinessSettingsDatabase,
): Promise<BusinessSettingsView> {
  const settings = await findBusinessSettings(database);
  const sequences = await findDocumentSequences(database);

  return {
    isConfigured: settings !== null,
    settings,
    sequences,
  };
}

/** Copies only database fields from a complete first-time setup request. */
function readNewBusinessSettings(
  input: BusinessSettingsSetupInput,
): NewBusinessSettings {
  return {
    businessName: input.businessName,
    phone: input.phone,
    email: input.email,
    address: input.address,
    logoUrl: input.logoUrl,
    currency: input.currency,
    timezone: input.timezone,
  };
}

/** Creates first-time settings and all seven sequences in one transaction. */
async function createInitialSetup(
  database: BusinessSettingsDatabase,
  input: BusinessSettingsSetupInput,
): Promise<void> {
  const settings = await createBusinessSettings(
    database,
    readNewBusinessSettings(input),
  );

  if (!settings) {
    throw createServiceError(
      "BUSINESS_SETTINGS_CREATE_FAILED",
      "The business settings record was not created.",
      500,
    );
  }

  const sequences = await createDocumentSequences(database, input.sequences);

  if (sequences.length !== input.sequences.length) {
    throw createServiceError(
      "DOCUMENT_SEQUENCE_CREATE_FAILED",
      "Not all document sequences were created.",
      500,
    );
  }
}

/** Copies only editable business fields from a validated update. */
function readBusinessSettingsChanges(
  input: BusinessSettingsUpdateInput,
): BusinessSettingsChanges {
  const changes: BusinessSettingsChanges = {};

  if (input.businessName !== undefined) {
    changes.businessName = input.businessName;
  }

  if (input.phone !== undefined) {
    changes.phone = input.phone;
  }

  if (input.email !== undefined) {
    changes.email = input.email;
  }

  if (input.address !== undefined) {
    changes.address = input.address;
  }

  if (input.logoUrl !== undefined) {
    changes.logoUrl = input.logoUrl;
  }

  return changes;
}

/** Checks whether an update contains at least one business field. */
function hasBusinessSettingsChanges(changes: BusinessSettingsChanges): boolean {
  return Object.keys(changes).length > 0;
}

/** Rejects a sequence number that moves backward or reuses an issued number. */
function ensureSequenceDoesNotMoveBackward(
  currentSequence: DocumentSequenceRecord,
  requestedSequence: DocumentSequenceInput,
): void {
  if (requestedSequence.nextNumber < currentSequence.nextNumber) {
    throw createServiceError(
      "INVALID_SEQUENCE_NUMBER",
      `${requestedSequence.documentType} next number cannot be lowered.`,
      409,
    );
  }
}

/** Sorts sequence updates so concurrent transactions lock rows consistently. */
function compareSequenceOrder(
  left: DocumentSequenceInput,
  right: DocumentSequenceInput,
): number {
  return left.documentType.localeCompare(right.documentType);
}

/** Locks, validates, and updates every sequence supplied by the admin. */
async function updateSequences(
  database: BusinessSettingsDatabase,
  sequences: DocumentSequenceInput[],
): Promise<void> {
  const orderedSequences = [...sequences].sort(compareSequenceOrder);

  for (const sequence of orderedSequences) {
    const currentSequence = await lockDocumentSequence(
      database,
      sequence.documentType,
    );

    if (!currentSequence) {
      throw createServiceError(
        "DOCUMENT_SEQUENCE_NOT_FOUND",
        `${sequence.documentType} sequence does not exist.`,
        404,
      );
    }

    ensureSequenceDoesNotMoveBackward(currentSequence, sequence);

    const updatedSequence = await updateDocumentSequence(database, sequence);

    if (!updatedSequence) {
      throw createServiceError(
        "DOCUMENT_SEQUENCE_UPDATE_FAILED",
        `${sequence.documentType} sequence was not updated.`,
        500,
      );
    }
  }
}

/** Applies one validated update while the settings row is locked. */
async function applyExistingUpdate(
  database: BusinessSettingsDatabase,
  input: BusinessSettingsUpdateInput,
): Promise<void> {
  const changes = readBusinessSettingsChanges(input);

  if (hasBusinessSettingsChanges(changes)) {
    const settings = await updateBusinessSettings(database, changes);

    if (!settings) {
      throw createServiceError(
        "BUSINESS_SETTINGS_UPDATE_FAILED",
        "The business settings record was not updated.",
        500,
      );
    }
  }

  if (input.sequences) {
    await updateSequences(database, input.sequences);
  }
}

/**
 * Creates first-time setup or updates existing settings in one transaction.
 * Validation is selected only after the singleton row has been checked.
 */
export async function saveBusinessSettings(
  database: NodePgDatabase,
  requestBody: unknown,
): Promise<BusinessSettingsView> {
  /** Saves settings and document sequences inside the active database transaction. */
  async function saveInsideTransaction(
    transaction: BusinessSettingsDatabase,
  ): Promise<BusinessSettingsView> {
    await lockBusinessSettingsSave(transaction);
    const currentSettings = await lockBusinessSettings(transaction);

    if (!currentSettings) {
      const setupInput = parseBusinessSettingsSetup(requestBody);
      await createInitialSetup(transaction, setupInput);
    } else {
      const updateInput = parseBusinessSettingsUpdate(requestBody);
      await applyExistingUpdate(transaction, updateInput);
    }

    return getBusinessSettingsView(transaction);
  }

  return database.transaction(saveInsideTransaction);
}

/** Reserves one document number using an already active transaction. */
export async function reserveBusinessDocumentNumberInTransaction(
  database: BusinessSettingsDatabase,
  documentType: DocumentType,
): Promise<ReservedDocumentNumber> {
  const reservedNumber = await reserveNextDocumentNumber(database, documentType);

  if (!reservedNumber) {
    throw createServiceError(
      "DOCUMENT_SEQUENCE_NOT_FOUND",
      `${documentType} sequence does not exist.`,
      404,
    );
  }

  return reservedNumber;
}


