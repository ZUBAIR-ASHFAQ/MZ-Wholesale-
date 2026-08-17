import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { FastifyInstance } from "fastify";

import { AppError } from "../src/shared/errors/app-error.js";
import { registerSupplierRoutes } from "../src/modules/suppliers/suppliers.routes.js";
import {
  createSupplier,
  getSupplierOpenPurchases,
  updateSupplier,
} from "../src/modules/suppliers/suppliers.service.js";
import {
  createSupplierSchema,
  updateSupplierSchema,
} from "../src/modules/suppliers/suppliers.schema.js";
import type {
  NewSupplier,
  SupplierRecord,
  SuppliersDatabase,
} from "../src/modules/suppliers/suppliers.repository.js";

/** Reads a project source file for focused architecture regression checks. */
async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

/** Creates one complete supplier row for focused service tests. */
function makeSupplier(
  changes: Partial<SupplierRecord> = {},
): SupplierRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    code: "SUP-EXAMPLE01",
    name: "Example Supplier",
    phone: null,
    email: null,
    address: null,
    taxId: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...changes,
  };
}

/** Creates a small Drizzle-shaped database used only by Supplier service tests. */
function makeDatabase(options: {
  selectRows?: SupplierRecord[][];
  insertedSupplier?: SupplierRecord;
  updatedSupplier?: SupplierRecord;
  insertErrors?: unknown[];
  onInsert?: (input: NewSupplier) => void;
} = {}): SuppliersDatabase {
  const selectRows = [...(options.selectRows ?? [])];
  const insertErrors = [...(options.insertErrors ?? [])];

  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                /** Returns the next prepared supplier row list. */
                async limit(): Promise<SupplierRecord[]> {
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
        values(input: NewSupplier) {
          options.onInsert?.(input);

          return {
            /** Returns the prepared supplier or throws the next prepared error. */
            async returning(): Promise<SupplierRecord[]> {
              const error = insertErrors.shift();

              if (error) {
                throw error;
              }

              return options.insertedSupplier
                ? [options.insertedSupplier]
                : [];
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
                /** Returns the prepared updated supplier. */
                async returning(): Promise<SupplierRecord[]> {
                  return options.updatedSupplier
                    ? [options.updatedSupplier]
                    : [];
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SuppliersDatabase;
}

/** Verifies that clients cannot submit system-managed supplier fields. */
test("supplier create validation rejects system-managed fields", () => {
  const result = createSupplierSchema.safeParse({
    name: "ABC Supplies",
    code: "SUP-CUSTOM",
    currentPayable: "100.00",
  });

  assert.equal(result.success, false);
});

/** Verifies required name, email and update validation rules. */
test("supplier validation enforces required fields", () => {
  assert.equal(createSupplierSchema.safeParse({ name: "" }).success, false);
  assert.equal(
    createSupplierSchema.safeParse({
      name: "ABC Supplies",
      email: "invalid-email",
    }).success,
    false,
  );
  assert.equal(updateSupplierSchema.safeParse({}).success, false);
});

/** Verifies that supplier opening balance is accepted and defaults to zero. */
test("supplier create validation handles opening balance", () => {
  const defaultResult = createSupplierSchema.safeParse({
    name: "ABC Supplies",
  });
  const openingBalanceResult = createSupplierSchema.safeParse({
    name: "ABC Supplies",
    openingBalance: "2500.50",
  });
  const invalidResult = createSupplierSchema.safeParse({
    name: "ABC Supplies",
    openingBalance: "-1.00",
  });

  assert.equal(defaultResult.success, true);
  if (defaultResult.success) {
    assert.equal(defaultResult.data.openingBalance, "0.00");
  }

  assert.equal(openingBalanceResult.success, true);
  assert.equal(invalidResult.success, false);
});

/** Verifies that supplier creation uses a server-generated code. */
test("supplier service creates a supplier with a generated code", async () => {
  const savedSupplier = makeSupplier({ code: "SUP-ABC1234567" });
  let insertedInput: NewSupplier | undefined;
  const database = makeDatabase({
    insertedSupplier: savedSupplier,
    onInsert(input) {
      insertedInput = input;
    },
  });

  const result = await createSupplier(database, {
    name: "  ABC Supplies  ",
    phone: " 03001234567 ",
    email: null,
    address: null,
    taxId: null,
    openingBalance: "0.00",
  });

  assert.equal(result, savedSupplier);
  assert.match(insertedInput?.code ?? "", /^SUP-[A-F0-9]{10}$/);
  assert.equal(insertedInput?.name, "ABC Supplies");
  assert.equal(insertedInput?.phone, "03001234567");
  assert.equal(insertedInput?.isActive, true);
});

/** Verifies that generated supplier-code conflicts are retried safely. */
test("supplier creation retries generated-code conflicts", async () => {
  const conflict = {
    code: "23505",
    constraint: "suppliers_code_normalized_unique",
  };
  const savedSupplier = makeSupplier();
  const insertedCodes: string[] = [];
  const database = makeDatabase({
    insertedSupplier: savedSupplier,
    insertErrors: [conflict],
    onInsert(input) {
      insertedCodes.push(input.code);
    },
  });

  const result = await createSupplier(database, {
    name: "ABC Supplies",
    phone: null,
    email: null,
    address: null,
    taxId: null,
    openingBalance: "0.00",
  });

  assert.equal(result, savedSupplier);
  assert.equal(insertedCodes.length, 2);
  assert.notEqual(insertedCodes[0], insertedCodes[1]);
});

/** Verifies that unrelated database failures are not hidden. */
test("supplier creation preserves unrelated database errors", async () => {
  const databaseError = { code: "08006", message: "connection failed" };
  const database = makeDatabase({ insertErrors: [databaseError] });

  await assert.rejects(
    createSupplier(database, {
      name: "ABC Supplies",
      phone: null,
      email: null,
      address: null,
      taxId: null,
      openingBalance: "0.00",
    }),
    (error: unknown) => error === databaseError,
  );
});

/** Verifies that suppliers may be deactivated and still loaded historically. */
test("supplier service updates an inactive supplier", async () => {
  const inactiveSupplier = makeSupplier({ isActive: false });
  const database = makeDatabase({
    selectRows: [[makeSupplier()]],
    updatedSupplier: inactiveSupplier,
  });

  const result = await updateSupplier(
    database,
    inactiveSupplier.id,
    { isActive: false },
  );

  assert.equal(result.isActive, false);
});


/** Verifies that the supplier profile now loads real recent purchases. */
test("supplier profile includes recent confirmed purchases", async () => {
  const service = await readProjectFile("../src/modules/suppliers/suppliers.service.ts");
  const repository = await readProjectFile("../src/modules/suppliers/suppliers.repository.ts");

  assert.match(service, /listRecentSupplierPurchases/);
  assert.match(service, /recentPurchasesAvailable: true/);
  assert.match(repository, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(repository, /desc\(purchases\.purchaseDate\)/);
});

/** Verifies the supplier service now reads real confirmed outstanding purchases. */
test("supplier open purchases use the Purchase-backed repository query", async () => {
  const service = await readProjectFile("../src/modules/suppliers/suppliers.service.ts");
  const repository = await readProjectFile("../src/modules/suppliers/suppliers.repository.ts");

  assert.match(service, /listSupplierOpenPurchases/);
  assert.match(repository, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(repository, /dueAmount/);
  assert.doesNotMatch(service, /PURCHASE_MODULE_NOT_READY/);
});

/** Verifies that Supplier Management registers only authenticated approved routes. */
test("supplier routes are authenticated and contain no delete route", async () => {
  const routes: Array<{ method: string; path: string; options: unknown }> = [];
  const authenticate = async (): Promise<void> => undefined;
  const app = {
    authenticate,
    get(path: string, options: unknown) {
      routes.push({ method: "GET", path, options });
    },
    post(path: string, options: unknown) {
      routes.push({ method: "POST", path, options });
    },
    patch(path: string, options: unknown) {
      routes.push({ method: "PATCH", path, options });
    },
  } as unknown as FastifyInstance;

  await registerSupplierRoutes(app);

  assert.equal(routes.length, 5);
  assert.equal(routes.some((route) => route.method === "DELETE"), false);
  assert.equal(
    routes.every(
      (route) =>
        (route.options as { preHandler?: unknown }).preHandler ===
        authenticate,
    ),
    true,
  );
});

/** Verifies that repeated generated-code conflicts produce a stable error. */
test("supplier creation stops after repeated generated-code conflicts", async () => {
  const conflict = {
    code: "23505",
    constraint: "suppliers_code_normalized_unique",
  };
  const database = makeDatabase({
    insertErrors: [conflict, conflict, conflict, conflict, conflict],
  });

  await assert.rejects(
    createSupplier(database, {
      name: "ABC Supplies",
      phone: null,
      email: null,
      address: null,
      taxId: null,
    }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "SUPPLIER_CODE_GENERATION_FAILED",
  );
});

/** Verifies Pass 36 shows supplier-specific Purchase Returns on the supplier profile. */
test("Module 11 Pass 36 integrates Purchase Returns with supplier profiles", async () => {
  const source = await readFile(
    new URL("../../web-admin/src/features/suppliers/pages/supplier-detail-page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /usePurchaseReturns\(\{/);
  assert.match(source, /supplierId,/);
  assert.match(source, /pageSize:\s*5/);
  assert.match(source, /Recent purchase returns/);
  assert.match(source, /PurchaseReturnTable/);
});
