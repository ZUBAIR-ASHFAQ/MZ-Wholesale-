import type { FastifyPluginAsync } from "fastify";

import { registerPurchaseRoutes } from "./purchases.routes.js";

/** Registers the Purchase Management routes currently enabled for Module 9. */
export const purchasesModule: FastifyPluginAsync = async (app) => {
  await registerPurchaseRoutes(app);
};
