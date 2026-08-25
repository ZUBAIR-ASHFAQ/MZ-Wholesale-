import type { FastifyPluginAsync } from "fastify";

import { registerPaymentRoutes } from "./payments.routes.js";

/** Registers the approved Payments, Cash and Bank routes. */
export const paymentsModule: FastifyPluginAsync = async (app) => {
  await registerPaymentRoutes(app);
};

/**
 * Internal immutable movement writers used by future Sales, Purchases,
 * Returns, and Expenses workflows inside their existing transaction.
 */
export {
  writeBankInflow,
  writeBankOutflow,
  writeCashInflow,
  writeCashOutflow,
} from "./payments.service.js";
