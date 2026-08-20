import { zodResolver } from "@hookform/resolvers/zod";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import { useExpenseCategories, useCreateExpense } from "../hooks/use-expenses.ts";

const expenseFormSchema = z
  .object({
    expenseCategoryId: z.string().uuid("Select an expense category."),
    expenseDate: z
      .string()
      .min(1, "Expense date is required.")
      .refine((value) => value <= today(), "Expense date cannot be in the future."),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount with up to two decimals.")
      .refine((value) => Number(value) > 0, "Amount must be greater than zero."),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]),
    cashAccountId: z.string(),
    bankAccountId: z.string(),
    note: z.string().max(500, "Note must be 500 characters or fewer."),
    receiptUrl: z
      .string()
      .trim()
      .refine(
        (value) => value.length === 0 || z.string().url().safeParse(value).success,
        "Enter a valid receipt URL.",
      ),
  })
  .superRefine((values, context) => {
    if (values.paymentMethod === "CASH" && !values.cashAccountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cashAccountId"],
        message: "Select a cash account.",
      });
    }

    if (values.paymentMethod === "BANK_TRANSFER" && !values.bankAccountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankAccountId"],
        message: "Select a bank account.",
      });
    }
  });

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface ExpenseFormProps {
  onSaved(): void;
  onCancel(): void;
}

/** Returns today's local date in the YYYY-MM-DD format expected by the API. */
function today(): string {
  return currentBusinessDate();
}

/** Returns a readable message from an API or unexpected form error. */
function readError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The expense could not be created.";
}

/** Creates one confirmed cash or bank expense. */
export function ExpenseForm({
  onSaved,
  onCancel,
}: ExpenseFormProps): React.JSX.Element {
  const categoriesQuery = useExpenseCategories();
  const accountsQuery = usePaymentAccounts();
  const createExpense = useCreateExpense();
  const idempotencyKey = useRef(crypto.randomUUID());
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      expenseCategoryId: "",
      expenseDate: today(),
      amount: "",
      paymentMethod: "CASH",
      cashAccountId: "",
      bankAccountId: "",
      note: "",
      receiptUrl: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");
  const categories = (categoriesQuery.data?.data ?? []).filter(
    (category) => category.isActive,
  );
  const cashAccounts = (accountsQuery.data?.data.cashAccounts ?? []).filter(
    (account) => account.isActive,
  );
  const bankAccounts = (accountsQuery.data?.data.bankAccounts ?? []).filter(
    (account) => account.isActive,
  );

  /** Changes payment method and clears the account that no longer applies. */
  function changePaymentMethod(method: "CASH" | "BANK_TRANSFER"): void {
    form.setValue("paymentMethod", method, { shouldValidate: true });

    if (method === "CASH") {
      form.setValue("bankAccountId", "");
    } else {
      form.setValue("cashAccountId", "");
    }
  }

  /** Submits one validated expense and keeps the same idempotency key on retries. */
  async function handleSubmit(values: ExpenseFormValues): Promise<void> {
    try {
      await createExpense.mutateAsync({
        input: {
          expenseCategoryId: values.expenseCategoryId,
          expenseDate: values.expenseDate,
          amount: values.amount.trim(),
          paymentMethod: values.paymentMethod,
          cashAccountId:
            values.paymentMethod === "CASH" ? values.cashAccountId : undefined,
          bankAccountId:
            values.paymentMethod === "BANK_TRANSFER"
              ? values.bankAccountId
              : undefined,
          note: values.note.trim() || null,
          receiptUrl: values.receiptUrl.trim() || null,
        },
        idempotencyKey: idempotencyKey.current,
      });

      idempotencyKey.current = crypto.randomUUID();
      form.reset({
        expenseCategoryId: "",
        expenseDate: today(),
        amount: "",
        paymentMethod: "CASH",
        cashAccountId: "",
        bankAccountId: "",
        note: "",
        receiptUrl: "",
      });
      onSaved();
    } catch (error) {
      form.setError("root", { message: readError(error) });
    }
  }

  return (
    <form className="management-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <h3>Add expense</h3>

      <div className="payment-filter-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <label className="ui-field">
          <span>Category</span>
          <select
            disabled={createExpense.isPending || categoriesQuery.isPending}
            {...form.register("expenseCategoryId")}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {form.formState.errors.expenseCategoryId ? (
            <small>{form.formState.errors.expenseCategoryId.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Expense date</span>
          <input
            disabled={createExpense.isPending}
            max={today()}
            type="date"
            {...form.register("expenseDate")}
          />
          {form.formState.errors.expenseDate ? (
            <small>{form.formState.errors.expenseDate.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Amount (PKR)</span>
          <input
            disabled={createExpense.isPending}
            inputMode="decimal"
            placeholder="0.00"
            {...form.register("amount")}
          />
          {form.formState.errors.amount ? (
            <small>{form.formState.errors.amount.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Payment method</span>
          <select
            disabled={createExpense.isPending}
            value={paymentMethod}
            onChange={(event) =>
              changePaymentMethod(
                event.target.value as "CASH" | "BANK_TRANSFER",
              )
            }
          >
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </label>

        {paymentMethod === "CASH" ? (
          <label className="ui-field">
            <span>Cash account</span>
            <select
              disabled={createExpense.isPending || accountsQuery.isPending}
              {...form.register("cashAccountId")}
            >
              <option value="">Select cash account</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            {form.formState.errors.cashAccountId ? (
              <small>{form.formState.errors.cashAccountId.message}</small>
            ) : null}
          </label>
        ) : (
          <label className="ui-field">
            <span>Bank account</span>
            <select
              disabled={createExpense.isPending || accountsQuery.isPending}
              {...form.register("bankAccountId")}
            >
              <option value="">Select bank account</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} — {account.accountName} ({account.accountNumber})
                </option>
              ))}
            </select>
            {form.formState.errors.bankAccountId ? (
              <small>{form.formState.errors.bankAccountId.message}</small>
            ) : null}
          </label>
        )}

        <label className="ui-field">
          <span>Receipt URL</span>
          <input
            disabled={createExpense.isPending}
            placeholder="https://..."
            {...form.register("receiptUrl")}
          />
          {form.formState.errors.receiptUrl ? (
            <small>{form.formState.errors.receiptUrl.message}</small>
          ) : null}
        </label>
      </div>

      <label className="ui-field">
        <span>Note</span>
        <textarea
          disabled={createExpense.isPending}
          rows={3}
          {...form.register("note")}
        />
        {form.formState.errors.note ? (
          <small>{form.formState.errors.note.message}</small>
        ) : null}
      </label>


      {categoriesQuery.isError ? (
        <p className="error-message">Expense categories could not be loaded.</p>
      ) : null}
      {accountsQuery.isError ? (
        <p className="error-message">Payment accounts could not be loaded.</p>
      ) : null}
      {form.formState.errors.root ? (
        <p className="error-message">{form.formState.errors.root.message}</p>
      ) : null}

      <div className="form-actions">
        <Button
          disabled={
            createExpense.isPending ||
            categoriesQuery.isPending ||
            accountsQuery.isPending
          }
          label={createExpense.isPending ? "Saving..." : "Create expense"}
          type="submit"
        />
        <Button
          disabled={createExpense.isPending}
          label="Cancel"
          onClick={onCancel}
        />
      </div>
    </form>
  );
}
