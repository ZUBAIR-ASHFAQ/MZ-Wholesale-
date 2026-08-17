import type { FastifyPluginAsync } from "fastify";

import { registerLedgerRoutes } from "./ledgers.routes.js";

/** Registers the four authenticated, read-only Ledger routes. */
export const ledgersModule: FastifyPluginAsync = async (app) => {
  await registerLedgerRoutes(app);
};

/** Internal balance readers used by Customer and Supplier profile services. */
export {
  getCustomerCurrentDue,
  getSupplierCurrentPayable,
} from "./ledgers.service.js";

/**
 * Internal immutable writers used by future source modules inside their own
 * PostgreSQL transaction. These functions are not exposed as HTTP routes.
 */
export {
  writeCustomerCredit,
  writeCustomerDebit,
  writeSupplierCredit,
  writeSupplierDebit,
} from "./ledgers.service.js";
