import type { FastifyInstance } from "fastify";

import {
  FIXED_CURRENCY,
  FIXED_TIMEZONE,
  getSupportedDocumentTypes,
  parseBusinessSettingsSetup,
  parseBusinessSettingsUpdate,
  validateBusinessSettingsQuery,
  businessSettingsQuerySchema,
  businessSettingsSetupSchema,
  businessSettingsUpdateSchema,
  documentSequenceInputSchema,
  type BusinessSettingsSetupInput,
  type BusinessSettingsUpdateInput,
  type DocumentSequenceInput,
  type DocumentType,
} from "./business-settings.schema.js";
import { registerBusinessSettingsRoutes } from "./business-settings.routes.js";
import {
  getBusinessSettingsView,
  reserveBusinessDocumentNumberInTransaction,
  saveBusinessSettings,
  type BusinessSettingsView,
} from "./business-settings.service.js";

/** Registers the Business Settings routes on the Fastify application. */
export async function businessSettingsModule(app: FastifyInstance): Promise<void> {
  await registerBusinessSettingsRoutes(app);
}

// Export only values that other modules or tests genuinely use.
export {
  FIXED_CURRENCY,
  FIXED_TIMEZONE,
  businessSettingsSetupSchema,
  businessSettingsUpdateSchema,
  businessSettingsQuerySchema,
  documentSequenceInputSchema,
  getBusinessSettingsView,
  getSupportedDocumentTypes,
  parseBusinessSettingsSetup,
  parseBusinessSettingsUpdate,
  reserveBusinessDocumentNumberInTransaction,
  registerBusinessSettingsRoutes,
  saveBusinessSettings,
  validateBusinessSettingsQuery,
};

export type {
  BusinessSettingsSetupInput,
  BusinessSettingsView,
  BusinessSettingsUpdateInput,
  DocumentSequenceInput,
  DocumentType,
};
