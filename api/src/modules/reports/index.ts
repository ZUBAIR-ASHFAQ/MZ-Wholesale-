import type { FastifyPluginAsync } from "fastify";

import { registerReportRoutes } from "./reports.routes.js";

/** Registers the nine authenticated, read-only Reports routes for Module 13. */
export const reportsModule: FastifyPluginAsync = async (app) => {
  await registerReportRoutes(app);
};
