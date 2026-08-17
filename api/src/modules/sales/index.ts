import type { FastifyPluginAsync } from "fastify";

import { registerSalesRoutes } from "./sales.routes.js";

/** Registers the Counter Sales routes required by Module 10. */
export const salesModule: FastifyPluginAsync = async (app) => {
  await registerSalesRoutes(app);
};
