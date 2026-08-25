import type { FastifyPluginAsync } from "fastify";

import {
  registerPurchaseReturnRoutes,
  registerSalesReturnRoutes,
} from "./returns.routes.js";

/** Registers the Sales Return and Purchase Return routes for Module 11. */
export const returnsModule: FastifyPluginAsync = async (app) => {
  await registerSalesReturnRoutes(app);
  await registerPurchaseReturnRoutes(app);
};
