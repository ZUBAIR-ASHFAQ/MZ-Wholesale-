import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";

import { AppError } from "../../shared/errors/app-error.js";

import {
  openApiAccessSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import {
  cashBankReportQuerySchema,
  customerAgingReportQuerySchema,
  customerOutstandingReportQuerySchema,
  expenseReportQuerySchema,
  inventoryReportQuerySchema,
  inventoryValuationReportQuerySchema,
  productProfitReportQuerySchema,
  profitSummaryReportQuerySchema,
  purchasesReportQuerySchema,
  salesReportQuerySchema,
  supplierAgingReportQuerySchema,
  supplierPayableReportQuerySchema,
} from "./reports.schema.js";
import { createReportsService } from "./reports.service.js";

/** Parses one report query and maps validation failures to the stable report error codes. */
function parseReportQuery<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const fields = result.error.issues.map((issue) => ({
    field: issue.path.length === 0 ? "request" : issue.path.map(String).join("."),
    message: issue.message,
  }));
  const hasDateError = result.error.issues.some((issue) =>
    issue.path.some((part) => part === "startDate" || part === "endDate"),
  );

  throw new AppError(
    hasDateError ? "INVALID_DATE_RANGE" : "INVALID_REPORT_FILTER",
    hasDateError
      ? "The report date range is invalid."
      : "The report contains an invalid filter.",
    400,
    fields,
  );
}

/** Builds the shared authentication and OpenAPI options for private report routes. */
function privateReportRoute(app: FastifyInstance, summary: string) {
  return {
    preHandler: app.authenticate,
    schema: {
      tags: ["reports"],
      summary,
      security: openApiAccessSecurity,
      response: {
        200: openApiSuccessResponse,
        ...openApiPrivateErrors,
      },
    },
  };
}

/** Registers the approved read-only Module 13 report routes. */
export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  const reportsService = createReportsService(app.db);

  /** Returns confirmed sales and sales-return activity for the selected filters. */
  async function handleSalesReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(salesReportQuerySchema, request.query);
    reply.send(createDataResponse(await reportsService.getSalesReport(query)));
  }

  /** Returns confirmed purchase and purchase-return activity for the selected filters. */
  async function handlePurchasesReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(purchasesReportQuerySchema, request.query);
    reply.send(createDataResponse(await reportsService.getPurchasesReport(query)));
  }

  /** Returns current stock together with matching immutable stock movements. */
  async function handleInventoryReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(inventoryReportQuerySchema, request.query);
    reply.send(createDataResponse(await reportsService.getInventoryReport(query)));
  }

  /** Returns current inventory quantities, weighted cost, and valuation totals. */
  async function handleInventoryValuationReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(inventoryValuationReportQuerySchema, request.query);
    reply.send(
      createDataResponse(await reportsService.getInventoryValuationReport(query)),
    );
  }

  /** Returns unpaid customer invoices grouped into aging buckets. */
  async function handleCustomerAgingReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(customerAgingReportQuerySchema, request.query);
    reply.send(
      createDataResponse(await reportsService.getCustomerAgingReport(query)),
    );
  }

  /** Returns unpaid supplier purchases grouped into aging buckets. */
  async function handleSupplierAgingReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(supplierAgingReportQuerySchema, request.query);
    reply.send(
      createDataResponse(await reportsService.getSupplierAgingReport(query)),
    );
  }

  /** Returns the paginated customer outstanding report. */
  async function handleCustomerOutstandingReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(customerOutstandingReportQuerySchema, request.query);
    reply.send(
      createDataResponse(await reportsService.getCustomerOutstandingReport(query)),
    );
  }

  /** Returns the paginated supplier payable report. */
  async function handleSupplierPayableReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(supplierPayableReportQuerySchema, request.query);
    reply.send(createDataResponse(await reportsService.getSupplierPayableReport(query)));
  }

  /** Returns cash and bank opening balances, movements, and closing balances. */
  async function handleCashBankReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(cashBankReportQuerySchema, request.query);
    reply.send(createDataResponse(await reportsService.getCashBankReport(query)));
  }

  /** Returns expense and expense-reversal activity for the selected filters. */
  async function handleExpenseReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(expenseReportQuerySchema, request.query);
    reply.send(createDataResponse(await reportsService.getExpenseReport(query)));
  }

  /** Returns the estimated profit summary based on immutable cost snapshots and expenses. */
  async function handleProfitSummaryReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(profitSummaryReportQuerySchema, request.query);
    reply.send(createDataResponse(await reportsService.getProfitSummaryReport(query)));
  }

  /** Returns paginated estimated profit values grouped by product. */
  async function handleProductProfitReport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseReportQuery(productProfitReportQuerySchema, request.query);
    reply.send(createDataResponse(await reportsService.getProductProfitReport(query)));
  }

  app.get(
    "/reports/sales",
    privateReportRoute(app, "Sales report"),
    handleSalesReport,
  );
  app.get(
    "/reports/purchases",
    privateReportRoute(app, "Purchases report"),
    handlePurchasesReport,
  );
  app.get(
    "/reports/inventory",
    privateReportRoute(app, "Inventory report"),
    handleInventoryReport,
  );
  app.get(
    "/reports/inventory-valuation",
    privateReportRoute(app, "Inventory valuation report"),
    handleInventoryValuationReport,
  );
  app.get(
    "/reports/customers/aging",
    privateReportRoute(app, "Customer aging report"),
    handleCustomerAgingReport,
  );
  app.get(
    "/reports/suppliers/aging",
    privateReportRoute(app, "Supplier aging report"),
    handleSupplierAgingReport,
  );
  app.get(
    "/reports/customers/outstanding",
    privateReportRoute(app, "Customer outstanding report"),
    handleCustomerOutstandingReport,
  );
  app.get(
    "/reports/suppliers/payable",
    privateReportRoute(app, "Supplier payable report"),
    handleSupplierPayableReport,
  );
  app.get(
    "/reports/cash-bank",
    privateReportRoute(app, "Cash and bank report"),
    handleCashBankReport,
  );
  app.get(
    "/reports/expenses",
    privateReportRoute(app, "Expense report"),
    handleExpenseReport,
  );
  app.get(
    "/reports/profit-summary",
    privateReportRoute(app, "Estimated profit summary report"),
    handleProfitSummaryReport,
  );
  app.get(
    "/reports/product-profit",
    privateReportRoute(app, "Product profit report"),
    handleProductProfitReport,
  );
}
