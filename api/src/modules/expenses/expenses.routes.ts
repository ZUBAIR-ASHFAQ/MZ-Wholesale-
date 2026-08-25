import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { executeIdempotentMutation } from "../../shared/http/idempotency.js";
import {
  openApiAccessSecurity,
  openApiMutationSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import { recordAuditLog } from "../system/system.service.js";
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  expenseCategoryIdParamsSchema,
  expenseIdParamsSchema,
  listExpensesQuerySchema,
  reverseExpenseSchema,
  updateExpenseCategorySchema,
} from "./expenses.schema.js";
import {
  createExpenseCategory,
  createExpenseInTransaction,
  getExpense,
  listExpenseCategories,
  listExpenses,
  reverseExpenseInTransaction,
  updateExpenseCategory,
} from "./expenses.service.js";

/** Builds one authenticated Expense route definition. */
function privateRoute(
  app: FastifyInstance,
  summary: string,
  mutation = false,
) {
  return {
    preHandler: app.authenticate,
    schema: {
      tags: ["expenses"],
      summary,
      security: mutation ? openApiMutationSecurity : openApiAccessSecurity,
      response: {
        200: openApiSuccessResponse,
        201: openApiSuccessResponse,
        ...openApiPrivateErrors,
      },
    },
  };
}

/** Executes one idempotent Expense financial mutation and sends its saved response. */
async function sendIdempotentExpenseMutation(
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

/** Registers exactly the approved Module 12 Expense routes. */
export async function registerExpenseRoutes(app: FastifyInstance): Promise<void> {
  /** Records one important successful mutation without changing the business response if audit storage is unavailable. */
  async function auditMutation(request: FastifyRequest, action: string, entity: string, afterData: unknown): Promise<void> {
    await recordAuditLog(app.db, {
      adminUserId: request.admin?.adminUserId ?? null,
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    }, action, entity, null, afterData);
  }

  /** Lists all expense categories. */
  async function handleListExpenseCategories(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    reply.send(createDataResponse(await listExpenseCategories(app.db)));
  }

  /** Creates one expense category. */
  async function handleCreateExpenseCategory(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createExpenseCategorySchema.parse(request.body);
    const category = await createExpenseCategory(app.db, input);
    await auditMutation(request, "EXPENSE_CATEGORY_CREATED", "EXPENSE_CATEGORY", category);
    reply.status(201).send(createDataResponse(category));
  }

  /** Renames or activates/deactivates one expense category. */
  async function handleUpdateExpenseCategory(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = expenseCategoryIdParamsSchema.parse(request.params);
    const input = updateExpenseCategorySchema.parse(request.body);
    const category = await updateExpenseCategory(app.db, params.id, input);
    await auditMutation(request, "EXPENSE_CATEGORY_UPDATED", "EXPENSE_CATEGORY", category);
    reply.send(createDataResponse(category));
  }

  /** Lists expenses using the approved filters. */
  async function handleListExpenses(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listExpensesQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listExpenses(app.db, query)));
  }

  /** Creates one expense through an idempotent financial transaction. */
  async function handleCreateExpense(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createExpenseSchema.parse(request.body);
    const replayed = await sendIdempotentExpenseMutation(
      app,
      request,
      reply,
      input,
      201,
      async (transaction) => {
        const expense = await createExpenseInTransaction(transaction, input);
        request.log.info(
          { expenseId: expense.id, expenseNumber: expense.expenseNumber },
          "Expense created.",
        );
        return expense;
      },
    );
    if (!replayed) {
      await auditMutation(request, "EXPENSE_CREATED", "EXPENSE", { input });
    }
  }

  /** Loads one immutable expense detail. */
  async function handleGetExpense(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = expenseIdParamsSchema.parse(request.params);
    reply.send(createDataResponse(await getExpense(app.db, params.id)));
  }

  /** Reverses one expense through an idempotent financial transaction. */
  async function handleReverseExpense(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = expenseIdParamsSchema.parse(request.params);
    const input = reverseExpenseSchema.parse(request.body);
    const replayed = await sendIdempotentExpenseMutation(
      app,
      request,
      reply,
      { params, input },
      200,
      async (transaction) => {
        const reversal = await reverseExpenseInTransaction(
          transaction,
          params.id,
          input,
        );
        request.log.info(
          {
            expenseId: params.id,
            reversalExpenseId: reversal.id,
            reversalExpenseNumber: reversal.expenseNumber,
          },
          "Expense reversed.",
        );
        return reversal;
      },
    );
    if (!replayed) {
      await auditMutation(request, "EXPENSE_REVERSED", "EXPENSE", { id: params.id, reason: input.reason });
    }
  }

  app.get(
    "/expense-categories",
    privateRoute(app, "List expense categories"),
    handleListExpenseCategories,
  );
  app.post(
    "/expense-categories",
    privateRoute(app, "Create an expense category", true),
    handleCreateExpenseCategory,
  );
  app.patch(
    "/expense-categories/:id",
    privateRoute(app, "Update an expense category", true),
    handleUpdateExpenseCategory,
  );
  app.get(
    "/expenses",
    privateRoute(app, "List expenses"),
    handleListExpenses,
  );
  app.post(
    "/expenses",
    privateRoute(app, "Create an expense", true),
    handleCreateExpense,
  );
  app.get(
    "/expenses/:id",
    privateRoute(app, "Load one expense"),
    handleGetExpense,
  );
  app.post(
    "/expenses/:id/reverse",
    privateRoute(app, "Reverse an expense", true),
    handleReverseExpense,
  );
}
