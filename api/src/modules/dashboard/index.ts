import type { FastifyPluginAsync } from "fastify";

import { registerDashboardRoutes } from "./dashboard.routes.js";

/** Registers the two authenticated, read-only Dashboard routes for Module 14. */
export const dashboardModule: FastifyPluginAsync = async (app) => {
  await registerDashboardRoutes(app);
};
