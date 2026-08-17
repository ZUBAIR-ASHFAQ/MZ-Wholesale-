import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  openApiAccessSecurity,
  openApiMutationSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import { recordAuditLog } from "../system/system.service.js";
import {
  getBusinessSettingsView,
  saveBusinessSettings,
} from "./business-settings.service.js";
import { validateBusinessSettingsQuery } from "./business-settings.schema.js";

/** Handles the admin request that reads the complete Business Settings view. */
async function handleGetBusinessSettings(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  validateBusinessSettingsQuery(request.query);

  const view = await getBusinessSettingsView(request.server.db);
  reply.send(createDataResponse(view));
}

/** Handles the admin request that creates or updates Business Settings. */
async function handlePatchBusinessSettings(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const view = await saveBusinessSettings(request.server.db, request.body);
  await recordAuditLog(request.server.db, {
    adminUserId: request.admin?.adminUserId ?? null,
    requestId: request.id,
    ipAddress: request.ip ?? null,
    device: request.headers["user-agent"] ?? null,
  }, "BUSINESS_SETTINGS_SAVED", "BUSINESS_SETTINGS", null, view);
  reply.send(createDataResponse(view));
}

/** Registers the two approved Business Settings routes on Fastify. */
export async function registerBusinessSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/business-settings",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["business-settings"],
        summary: "Load business settings",
        security: openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handleGetBusinessSettings,
  );

  app.patch(
    "/business-settings",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["business-settings"],
        summary: "Create or update business settings",
        description: "Accepts business identity fields and approved document sequence prefixes and next numbers.",
        security: openApiMutationSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handlePatchBusinessSettings,
  );
}
