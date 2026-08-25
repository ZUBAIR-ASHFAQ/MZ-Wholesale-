import assert from "node:assert/strict";
import test from "node:test";

import type { FastifyInstance } from "fastify";

import { AppError } from "../src/shared/errors/app-error.js";
import { registerCustomerRoutes } from "../src/modules/customers/customers.routes.js";
import {
  createCustomer,
  getCustomerOpenInvoices,
  updateCustomer,
} from "../src/modules/customers/customers.service.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
} from "../src/modules/customers/customers.schema.js";
import type {
  CustomerRecord,
  CustomersDatabase,
  NewCustomer,
} from "../src/modules/customers/customers.repository.js";

/** Creates one complete customer row for focused service tests. */
function makeCustomer(
  changes: Partial<CustomerRecord> = {},
): CustomerRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    code: "CUS-EXAMPLE",
    name: "Example Customer",
    phone: null,
    email: null,
    address: null,
    creditLimit: "0.00",
    isWalkIn: false,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...changes,
  };
}

/** Creates a small Drizzle-shaped database used only by Customer service tests. */
function makeDatabase(options: {
  selectRows?: unknown[][];
  insertedCustomer?: CustomerRecord;
  updatedCustomer?: CustomerRecord;
  onInsert?: (input: NewCustomer, attempt: number) => void;
  insertErrors?: unknown[];
} = {}): CustomersDatabase {
  const selectRows = [...(options.selectRows ?? [])];
  const insertErrors = [...(options.insertErrors ?? [])];
  let insertAttempt = 0;

  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                /** Returns the next prepared row list for a repository lookup. */
                async limit(): Promise<unknown[]> {
                  return selectRows.shift() ?? [];
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        values(input: NewCustomer) {
          insertAttempt += 1;
          options.onInsert?.(input, insertAttempt);

          return {
            /** Returns the prepared inserted customer or throws the next prepared error. */
            async returning(): Promise<CustomerRecord[]> {
              const error = insertErrors.shift();

              if (error) {
                throw error;
              }

              return options.insertedCustomer
                ? [options.insertedCustomer]
                : [];
            },
            /** Supports the Walk-in Customer insert used during startup. */
            async onConflictDoNothing(): Promise<void> {
              return undefined;
            },
          };
        },
      };
    },
    update() {
      return {
        set() {
          return {
            where() {
              return {
                /** Returns the prepared updated customer. */
                async returning(): Promise<CustomerRecord[]> {
                  return options.updatedCustomer
                    ? [options.updatedCustomer]
                    : [];
                },
              };
            },
          };
        },
      };
    },
  } as unknown as CustomersDatabase;
}

/** Verifies that create validation rejects system-managed customer fields. */
test("customer create validation rejects system-managed fields", () => {
  const result = createCustomerSchema.safeParse({
    name: "Ali Traders",
    currentBalance: "100.00",
    isWalkIn: true,
  });

  assert.equal(result.success, false);
});

/** Verifies that the removed Tax ID field is no longer part of the customer API contract. */
test("customer validation rejects removed taxId field", () => {
  assert.equal(
    createCustomerSchema.safeParse({
      name: "Ali Traders",
      taxId: "NTN-123",
    }).success,
    false,
  );
  assert.equal(
    updateCustomerSchema.safeParse({
      taxId: "NTN-123",
    }).success,
    false,
  );
});

/** Verifies that customer credit limits cannot be negative. */
test("customer validation rejects a negative credit limit", () => {
  const result = createCustomerSchema.safeParse({
    name: "Ali Traders",
    creditLimit: "-1.00",
  });

  assert.equal(result.success, false);
});

/** Verifies that opening due cannot exceed the customer's approved credit limit. */
test("customer validation rejects opening balance above credit limit", () => {
  const result = createCustomerSchema.safeParse({
    name: "Ali Traders",
    creditLimit: "5000.00",
    openingBalance: "5000.01",
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0]?.path[0], "openingBalance");
  }
});

/** Verifies that an opening due equal to the credit limit remains valid. */
test("customer validation accepts opening balance within credit limit", () => {
  assert.equal(
    createCustomerSchema.safeParse({
      name: "Ali Traders",
      creditLimit: "5000.00",
      openingBalance: "5000.00",
    }).success,
    true,
  );
});

/** Verifies that an empty customer update is not accepted. */
test("customer update validation requires at least one field", () => {
  assert.equal(updateCustomerSchema.safeParse({}).success, false);
});

/** Verifies that normal customers are created with a server-generated code. */
test("customer service creates a regular customer", async () => {
  const savedCustomer = makeCustomer({ code: "CUS-ABC1234567" });
  let insertedInput: NewCustomer | undefined;
  const database = makeDatabase({
    insertedCustomer: savedCustomer,
    onInsert(input) {
      insertedInput = input;
    },
  });

  const result = await createCustomer(database, {
    name: "  Ali Traders  ",
    phone: " 03001234567 ",
    email: null,
    address: null,
    creditLimit: "5000.00",
    openingBalance: "0.00",
  });

  assert.equal(result, savedCustomer);
  assert.match(insertedInput?.code ?? "", /^CUS-[A-F0-9]{10}$/);
  assert.equal(insertedInput?.name, "Ali Traders");
  assert.equal(insertedInput?.phone, "03001234567");
  assert.equal(insertedInput?.isWalkIn, false);
  assert.equal(insertedInput?.isActive, true);
});

/** Verifies that a generated customer-code conflict is retried safely. */
test("customer creation retries a generated-code conflict", async () => {
  const savedCustomer = makeCustomer({ code: "CUS-RETRIED001" });
  const insertedCodes: string[] = [];
  const database = makeDatabase({
    insertedCustomer: savedCustomer,
    insertErrors: [
      {
        code: "23505",
        constraint: "customers_code_normalized_unique",
      },
    ],
    onInsert(input) {
      insertedCodes.push(input.code);
    },
  });

  const result = await createCustomer(database, {
    name: "Ali Traders",
    phone: null,
    email: null,
    address: null,
    creditLimit: "0.00",
      openingBalance: "0.00",
  });

  assert.equal(result, savedCustomer);
  assert.equal(insertedCodes.length, 2);
  assert.notEqual(insertedCodes[0], insertedCodes[1]);
});

/** Verifies that unrelated database errors are not hidden by the retry logic. */
test("customer creation preserves unrelated database errors", async () => {
  const databaseError = { code: "08006", message: "connection failed" };
  const database = makeDatabase({ insertErrors: [databaseError] });

  await assert.rejects(
    createCustomer(database, {
      name: "Ali Traders",
      phone: null,
      email: null,
      address: null,
      creditLimit: "0.00",
    }),
    (error: unknown) => error === databaseError,
  );
});

/** Verifies that repeated generated-code conflicts end with a stable application error. */
test("customer creation stops after repeated generated-code conflicts", async () => {
  const conflict = {
    code: "23505",
    constraint: "customers_code_normalized_unique",
  };
  const database = makeDatabase({
    insertErrors: [conflict, conflict, conflict, conflict, conflict],
  });

  await assert.rejects(
    createCustomer(database, {
      name: "Ali Traders",
      phone: null,
      email: null,
      address: null,
      creditLimit: "0.00",
    }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "CUSTOMER_CODE_GENERATION_FAILED",
  );
});

/** Verifies that the protected Walk-in Customer cannot be changed. */
test("customer service protects the Walk-in Customer", async () => {
  const database = makeDatabase({
    selectRows: [[makeCustomer({ isWalkIn: true, code: "WALK-IN" })]],
  });

  await assert.rejects(
    updateCustomer(database, "11111111-1111-4111-8111-111111111111", {
      name: "Changed name",
    }),
    (error: unknown) =>
      error instanceof AppError && error.code === "SYSTEM_CUSTOMER_PROTECTED",
  );
});

/** Verifies that the customer profile now loads recent confirmed Sales invoices. */
test("customer profile uses recent confirmed sales invoices", async () => {
  const { readFile } = await import("node:fs/promises");
  const repositorySource = await readFile(
    new URL("../src/modules/customers/customers.repository.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = await readFile(
    new URL("../src/modules/customers/customers.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(repositorySource, /listRecentCustomerInvoices/);
  assert.match(repositorySource, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(repositorySource, /desc\(salesInvoices\.invoiceDate\)/);
  assert.match(repositorySource, /\.limit\(limit\)/);
  assert.match(repositorySource, /dueAmount/);
  assert.match(serviceSource, /listRecentCustomerInvoices\(database, customerId\)/);
  assert.match(serviceSource, /recentInvoicesAvailable: true/);
});

/** Verifies that customer open invoices now use the Sales and receipt allocation tables. */
test("customer open invoices are backed by confirmed Sales data", async () => {
  const { readFile } = await import("node:fs/promises");
  const repositorySource = await readFile(
    new URL("../src/modules/customers/customers.repository.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = await readFile(
    new URL("../src/modules/customers/customers.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(repositorySource, /listCustomerOpenInvoices/);
  assert.match(repositorySource, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(repositorySource, /customerPaymentAllocations/);
  assert.match(repositorySource, /dueAmount/);
  assert.doesNotMatch(serviceSource, /SALES_MODULE_NOT_READY/);
  assert.match(serviceSource, /listCustomerOpenInvoices\(database, customerId, query\)/);
});

/** Verifies that all approved Customer routes are private and no delete route exists. */
test("customer module registers exactly five authenticated routes", async () => {
  const routes: Array<{
    method: string;
    path: string;
    preHandler: unknown;
  }> = [];
  const authenticate = async (): Promise<void> => undefined;

  const app = {
    authenticate,
    get(path: string, options: { preHandler: unknown }) {
      routes.push({ method: "GET", path, preHandler: options.preHandler });
    },
    post(path: string, options: { preHandler: unknown }) {
      routes.push({ method: "POST", path, preHandler: options.preHandler });
    },
    patch(path: string, options: { preHandler: unknown }) {
      routes.push({ method: "PATCH", path, preHandler: options.preHandler });
    },
  } as unknown as FastifyInstance;

  await registerCustomerRoutes(app);

  assert.deepEqual(
    routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /customers",
      "POST /customers",
      "GET /customers/:id",
      "PATCH /customers/:id",
      "GET /customers/:customerId/open-invoices",
    ],
  );
  assert.equal(routes.every((route) => route.preHandler === authenticate), true);
});

/** Verifies that the unused customer-code lookup query was removed. */
test("customer repository has no unused code lookup", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../src/modules/customers/customers.repository.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /findCustomerByCode/);
});

/** Verifies that customer creation no longer performs a pre-insert code lookup. */
test("customer creation relies on the unique database constraint", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../src/modules/customers/customers.service.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /findCustomerByCode/);
  assert.match(source, /customers_code_normalized_unique/);
});

/** Verifies Pass 36 shows customer-specific Sales Returns on the customer profile. */
test("Module 11 Pass 36 integrates Sales Returns with customer profiles", async () => {
  const source = await readFile(
    new URL("../../web-admin/src/features/customers/pages/customer-detail-page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /useSalesReturns\(\{/);
  assert.match(source, /customerId,/);
  assert.match(source, /pageSize:\s*5/);
  assert.match(source, /Recent sales returns/);
  assert.match(source, /SalesReturnTable/);
});
