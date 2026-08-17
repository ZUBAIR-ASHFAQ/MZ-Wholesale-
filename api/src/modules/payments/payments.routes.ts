import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { executeIdempotentMutation } from "../../shared/http/idempotency.js";
import {
  openApiAccessSecurity,
  openApiErrorResponse,
  openApiMutationSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import { recordAuditLog } from "../system/system.service.js";
import {
  createBankAccountSchema,
  createCashAccountSchema,
  createCashReconciliationSchema,
  createCustomerReceiptSchema,
  createSupplierPaymentSchema,
  createTransferSchema,
  customerReceiptListQuerySchema,
  dailyCashSummaryQuerySchema,
  movementListQuerySchema,
  paymentIdParamsSchema,
  reconciliationListQuerySchema,
  reversePaymentSchema,
  supplierPaymentListQuerySchema,
  transferListQuerySchema,
  updateBankAccountSchema,
  updateCashAccountSchema,
  updateCashReconciliationSchema,
} from "./payments.schema.js";
import {
  confirmCashReconciliation,
  createBankAccount,
  createCashAccount,
  createCashReconciliation,
  createCustomerReceipt,
  createSupplierPayment,
  createTransfer,
  getCustomerReceipt,
  getDailyCashSummary,
  getSupplierPayment,
  getTransfer,
  listAccounts,
  listCashBankMovements,
  listCashReconciliations,
  listCustomerReceipts,
  listSupplierPayments,
  listTransfers,
  reverseCustomerReceipt,
  reverseSupplierPayment,
  updateBankAccount,
  updateCashAccount,
  updateCashReconciliation,
} from "./payments.service.js";

/** Builds one authenticated route definition for the Payments module. */
function privateRoute(
  app: FastifyInstance,
  summary: string,
  mutation = false,
) {
  return {
    preHandler: app.authenticate,
    schema: {
      tags: ["payments"],
      summary,
      security: mutation ? openApiMutationSecurity : openApiAccessSecurity,
      response: {
        200: openApiSuccessResponse,
        201: openApiSuccessResponse,
        ...openApiPrivateErrors,
        503: openApiErrorResponse,
      },
    },
  };
}

/** Executes one required idempotent financial mutation and sends its saved response. */
async function sendIdempotentMutation(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  body: unknown,
  statusCode: number,
  operation: (transaction: FastifyInstance["db"]) => Promise<unknown>,
): Promise<boolean> {
  const response = await executeIdempotentMutation(
    app.db,
    {
      key: request.headers["idempotency-key"],
      method: request.method,
      path: request.routeOptions.url,
      body,
    },
    async (transaction) => ({
      statusCode,
      body: createDataResponse(await operation(transaction)),
    }),
  );

  reply.status(response.statusCode).send(response.body);
  return response.replayed;
}

/** Registers the approved Payments, Cash and Bank routes. */
export async function registerPaymentRoutes(
  app: FastifyInstance,
): Promise<void> {
  /** Records one important successful mutation without changing the business response if audit storage is unavailable. */
  async function auditMutation(request: FastifyRequest, action: string, entity: string, afterData: unknown): Promise<void> {
    await recordAuditLog(app.db, {
      adminUserId: request.admin?.adminUserId ?? null,
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    }, action, entity, null, afterData);
  }

  /** Lists all cash and bank accounts with calculated balances. */
  async function handleListAccounts(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    reply.send(createDataResponse(await listAccounts(app.db)));
  }

  /** Creates one cash account and its optional opening movement. */
  async function handleCreateCashAccount(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createCashAccountSchema.parse(request.body);
    const replayed = await sendIdempotentMutation(app, request, reply, input, 201, (transaction) =>
      createCashAccount(transaction, input),
    );
    if (!replayed) {
      await auditMutation(request, "CASH_ACCOUNT_CREATED", "CASH_ACCOUNT", { input });
    }
  }

  /** Updates the permitted identity or active fields of one cash account. */
  async function handleUpdateCashAccount(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    const input = updateCashAccountSchema.parse(request.body);
    const result = await updateCashAccount(app.db, params.id, input);
    await auditMutation(request, "CASH_ACCOUNT_UPDATED", "CASH_ACCOUNT", result);
    reply.send(createDataResponse(result));
  }

  /** Creates one bank account and its optional opening movement. */
  async function handleCreateBankAccount(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createBankAccountSchema.parse(request.body);
    const replayed = await sendIdempotentMutation(app, request, reply, input, 201, (transaction) =>
      createBankAccount(transaction, input),
    );
    if (!replayed) {
      await auditMutation(request, "BANK_ACCOUNT_CREATED", "BANK_ACCOUNT", { input });
    }
  }

  /** Updates the permitted identity or active fields of one bank account. */
  async function handleUpdateBankAccount(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    const input = updateBankAccountSchema.parse(request.body);
    const result = await updateBankAccount(app.db, params.id, input);
    await auditMutation(request, "BANK_ACCOUNT_UPDATED", "BANK_ACCOUNT", result);
    reply.send(createDataResponse(result));
  }

  /** Lists customer receipts after the Sales dependency becomes available. */
  async function handleListCustomerReceipts(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = customerReceiptListQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listCustomerReceipts(app.db, query)));
  }

  /** Creates one customer receipt through an idempotent financial request. */
  async function handleCreateCustomerReceipt(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createCustomerReceiptSchema.parse(request.body);
    const replayed = await sendIdempotentMutation(app, request, reply, input, 201, (transaction) =>
      createCustomerReceipt(transaction, input),
    );
    if (!replayed) {
      await auditMutation(request, "CUSTOMER_RECEIPT_CREATED", "CUSTOMER_PAYMENT", { input });
    }
  }

  /** Loads one customer receipt after the Sales dependency becomes available. */
  async function handleGetCustomerReceipt(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    reply.send(createDataResponse(await getCustomerReceipt(app.db, params.id)));
  }

  /** Reverses one customer receipt through an idempotent financial request. */
  async function handleReverseCustomerReceipt(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    const input = reversePaymentSchema.parse(request.body);
    const replayed = await sendIdempotentMutation(
      app,
      request,
      reply,
      { params, input },
      200,
      (transaction) => reverseCustomerReceipt(transaction, params.id, input),
    );
    if (!replayed) {
      await auditMutation(request, "CUSTOMER_RECEIPT_REVERSED", "CUSTOMER_PAYMENT", { id: params.id, reason: input.reason });
    }
  }

  /** Lists supplier payments after the Purchase dependency becomes available. */
  async function handleListSupplierPayments(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = supplierPaymentListQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listSupplierPayments(app.db, query)));
  }

  /** Creates one supplier payment through an idempotent financial request. */
  async function handleCreateSupplierPayment(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createSupplierPaymentSchema.parse(request.body);
    const replayed = await sendIdempotentMutation(app, request, reply, input, 201, (transaction) =>
      createSupplierPayment(transaction, input),
    );
    if (!replayed) {
      await auditMutation(request, "SUPPLIER_PAYMENT_CREATED", "SUPPLIER_PAYMENT", { input });
    }
  }

  /** Loads one supplier payment after the Purchase dependency becomes available. */
  async function handleGetSupplierPayment(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    reply.send(createDataResponse(await getSupplierPayment(app.db, params.id)));
  }

  /** Reverses one supplier payment through an idempotent financial request. */
  async function handleReverseSupplierPayment(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    const input = reversePaymentSchema.parse(request.body);
    const replayed = await sendIdempotentMutation(
      app,
      request,
      reply,
      { params, input },
      200,
      (transaction) => reverseSupplierPayment(transaction, params.id, input),
    );
    if (!replayed) {
      await auditMutation(request, "SUPPLIER_PAYMENT_REVERSED", "SUPPLIER_PAYMENT", { id: params.id, reason: input.reason });
    }
  }

  /** Returns the expected cash position for one account and business date. */
  async function handleDailyCashSummary(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = dailyCashSummaryQuerySchema.parse(request.query);
    reply.send(createDataResponse(await getDailyCashSummary(app.db, query)));
  }

  /** Lists immutable cash and bank movement history. */
  async function handleListCashBankMovements(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = movementListQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listCashBankMovements(app.db, query)));
  }

  /** Lists confirmed internal account transfers. */
  async function handleListTransfers(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = transferListQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listTransfers(app.db, query)));
  }

  /** Creates one internal transfer through an idempotent financial request. */
  async function handleCreateTransfer(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createTransferSchema.parse(request.body);
    const replayed = await sendIdempotentMutation(app, request, reply, input, 201, (transaction) =>
      createTransfer(transaction, input),
    );
    if (!replayed) {
      await auditMutation(request, "CASH_BANK_TRANSFER_CREATED", "CASH_BANK_TRANSFER", { input });
    }
  }

  /** Loads one immutable internal transfer. */
  async function handleGetTransfer(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    reply.send(createDataResponse(await getTransfer(app.db, params.id)));
  }

  /** Lists draft and confirmed cash reconciliations. */
  async function handleListCashReconciliations(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = reconciliationListQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listCashReconciliations(app.db, query)));
  }

  /** Creates one editable draft cash reconciliation. */
  async function handleCreateCashReconciliation(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createCashReconciliationSchema.parse(request.body);
    const result = await createCashReconciliation(app.db, input);
    await auditMutation(request, "CASH_RECONCILIATION_CREATED", "CASH_RECONCILIATION", result);
    reply.status(201).send(createDataResponse(result));
  }

  /** Updates counted cash or notes while a reconciliation remains a draft. */
  async function handleUpdateCashReconciliation(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    const input = updateCashReconciliationSchema.parse(request.body);
    const result = await updateCashReconciliation(app.db, params.id, input);
    await auditMutation(request, "CASH_RECONCILIATION_UPDATED", "CASH_RECONCILIATION", result);
    reply.send(createDataResponse(result));
  }

  /** Confirms one reconciliation through an idempotent financial request. */
  async function handleConfirmCashReconciliation(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = paymentIdParamsSchema.parse(request.params);
    const replayed = await sendIdempotentMutation(app, request, reply, params, 200, (transaction) =>
      confirmCashReconciliation(transaction, params.id),
    );
    if (!replayed) {
      await auditMutation(request, "CASH_RECONCILIATION_CONFIRMED", "CASH_RECONCILIATION", { id: params.id });
    }
  }

  app.get(
    "/payments/accounts",
    privateRoute(app, "List cash and bank accounts"),
    handleListAccounts,
  );
  app.post(
    "/payments/cash-accounts",
    privateRoute(app, "Create a cash account", true),
    handleCreateCashAccount,
  );
  app.patch(
    "/payments/cash-accounts/:id",
    privateRoute(app, "Update a cash account", true),
    handleUpdateCashAccount,
  );
  app.post(
    "/payments/bank-accounts",
    privateRoute(app, "Create a bank account", true),
    handleCreateBankAccount,
  );
  app.patch(
    "/payments/bank-accounts/:id",
    privateRoute(app, "Update a bank account", true),
    handleUpdateBankAccount,
  );
  app.get(
    "/payments/customer-receipts",
    privateRoute(app, "List customer receipts"),
    handleListCustomerReceipts,
  );
  app.post(
    "/payments/customer-receipts",
    privateRoute(app, "Create a customer receipt", true),
    handleCreateCustomerReceipt,
  );
  app.get(
    "/payments/customer-receipts/:id",
    privateRoute(app, "Load one customer receipt"),
    handleGetCustomerReceipt,
  );
  app.post(
    "/payments/customer-receipts/:id/reverse",
    privateRoute(app, "Reverse a customer receipt", true),
    handleReverseCustomerReceipt,
  );
  app.get(
    "/payments/supplier-payments",
    privateRoute(app, "List supplier payments"),
    handleListSupplierPayments,
  );
  app.post(
    "/payments/supplier-payments",
    privateRoute(app, "Create a supplier payment", true),
    handleCreateSupplierPayment,
  );
  app.get(
    "/payments/supplier-payments/:id",
    privateRoute(app, "Load one supplier payment"),
    handleGetSupplierPayment,
  );
  app.post(
    "/payments/supplier-payments/:id/reverse",
    privateRoute(app, "Reverse a supplier payment", true),
    handleReverseSupplierPayment,
  );
  app.get(
    "/payments/daily-cash-summary",
    privateRoute(app, "Load daily cash summary"),
    handleDailyCashSummary,
  );
  app.get(
    "/payments/cash-bank-movements",
    privateRoute(app, "List cash and bank movements"),
    handleListCashBankMovements,
  );
  app.get(
    "/payments/transfers",
    privateRoute(app, "List internal account transfers"),
    handleListTransfers,
  );
  app.post(
    "/payments/transfers",
    privateRoute(app, "Create an internal account transfer", true),
    handleCreateTransfer,
  );
  app.get(
    "/payments/transfers/:id",
    privateRoute(app, "Load one internal account transfer"),
    handleGetTransfer,
  );
  app.get(
    "/payments/cash-reconciliations",
    privateRoute(app, "List cash reconciliations"),
    handleListCashReconciliations,
  );
  app.post(
    "/payments/cash-reconciliations",
    privateRoute(app, "Create a draft cash reconciliation", true),
    handleCreateCashReconciliation,
  );
  app.patch(
    "/payments/cash-reconciliations/:id",
    privateRoute(app, "Update a draft cash reconciliation", true),
    handleUpdateCashReconciliation,
  );
  app.post(
    "/payments/cash-reconciliations/:id/confirm",
    privateRoute(app, "Confirm a cash reconciliation", true),
    handleConfirmCashReconciliation,
  );
}
