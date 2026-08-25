import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const hooksUrl = new URL("./hooks/use-expenses.ts", import.meta.url);

/** Reads the Expense query hooks used after account-affecting mutations. */
async function readExpenseHooks(): Promise<string> {
  return readFile(hooksUrl, "utf8");
}

describe("Expense account-balance refresh", () => {
  test("create and reversal eagerly reload the Payments accounts cache", async () => {
    const hooks = await readExpenseHooks();

    expect(hooks).toContain(
      'import { loadPaymentAccounts } from "../../payments/api/payments.api.ts"',
    );
    expect(hooks).toContain("paymentQueryKeys.accounts");
    expect(hooks).toContain("queryClient.fetchQuery");
    expect(hooks).toContain("queryFn: loadPaymentAccounts");
    expect(hooks).toContain("staleTime: 0");
    expect(hooks.match(/refreshExpenseAffectedData\(queryClient\)/g)).toHaveLength(2);
  });
});
