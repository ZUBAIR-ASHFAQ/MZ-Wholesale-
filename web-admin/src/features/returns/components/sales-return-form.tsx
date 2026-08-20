import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { useCustomers } from "../../customers/hooks/use-customers.ts";
import type { PaymentAccounts } from "../../payments/api/payments.api.ts";
import { useSale, useSales } from "../../sales/hooks/use-sales.ts";
import type { SalesReturnRefundMode } from "../api/returns.api.ts";
import { useCreateSalesReturn } from "../hooks/use-returns.ts";

const quantitySchema = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || /^\d+(\.\d{1,3})?$/.test(value),
    "Use a quantity with up to 3 decimals.",
  );

const salesReturnFormSchema = z
  .object({
    originalSaleId: z.string().min(1, "Select a confirmed sale."),
    returnDate: z.string().min(1, "Return date is required."),
    reason: z.string().trim().min(1, "Return reason is required.").max(500, "Reason must be 500 characters or fewer."),
    refundMode: z.enum(["DUE_REDUCTION", "CASH", "BANK_TRANSFER"]),
    cashAccountId: z.string(),
    bankAccountId: z.string(),
    items: z.array(
      z.object({
        originalSaleItemId: z.string(),
        quantity: quantitySchema,
        stockCondition: z.enum(["GOOD", "DAMAGED", "EXPIRED"]),
      }),
    ),
  })
  .superRefine((values, context) => {
    const selectedItems = values.items.filter((item) => Number(item.quantity) > 0);

    if (selectedItems.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Enter a positive return quantity for at least one item.",
      });
    }

    if (values.refundMode === "CASH" && !values.cashAccountId) {
      context.addIssue({
        code: "custom",
        path: ["cashAccountId"],
        message: "Select a cash account.",
      });
    }

    if (values.refundMode === "BANK_TRANSFER" && !values.bankAccountId) {
      context.addIssue({
        code: "custom",
        path: ["bankAccountId"],
        message: "Select a bank account.",
      });
    }
  });

type SalesReturnFormValues = z.infer<typeof salesReturnFormSchema>;

interface SalesReturnFormProps {
  accounts: PaymentAccounts;
  initialOriginalSaleId?: string;
  onSaved(): void;
  onCancel(): void;
}

/** Returns today's local form date in YYYY-MM-DD format. */
function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}


/** Converts one valid quantity string to thousandths for exact comparisons. */
function quantityToUnits(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  return BigInt(wholePart) * 1000n + BigInt(fractionPart.padEnd(3, "0"));
}

/** Returns whether a requested return quantity exceeds the original sold quantity. */
function exceedsSoldQuantity(returnQuantity: string, soldQuantity: string): boolean {
  const returnUnits = quantityToUnits(returnQuantity);
  const soldUnits = quantityToUnits(soldQuantity);
  return returnUnits !== null && soldUnits !== null && returnUnits > soldUnits;
}

/** Reads one user-friendly error message from the shared API error type. */
function readReturnError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The Sales Return could not be created.";
}

/** Renders the confirmed Sales Return entry form using original sale snapshots. */
export function SalesReturnForm({
  accounts,
  initialOriginalSaleId = "",
  onSaved,
  onCancel,
}: SalesReturnFormProps): React.JSX.Element {
  const createReturn = useCreateSalesReturn();
  const customersQuery = useCustomers({ page: 1, pageSize: 100 });
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const confirmedSalesQuery = useSales({
    customerId: selectedCustomerId || undefined,
    status: "CONFIRMED",
    page: 1,
    pageSize: 100,
  });
  const [formError, setFormError] = useState("");
  const [returnItems, setReturnItems] = useState<SalesReturnFormValues["items"]>([]);
  const [quantityErrors, setQuantityErrors] = useState<Record<number, string>>({});

  const {
    register,
    handleSubmit,
    watch,
    clearErrors,
    setValue,
    setError,
    formState: { errors },
  } = useForm<SalesReturnFormValues>({
    defaultValues: {
      originalSaleId: initialOriginalSaleId,
      returnDate: today(),
      reason: "",
      refundMode: "DUE_REDUCTION",
      cashAccountId: "",
      bankAccountId: "",
      items: [],
    },
  });

  const originalSaleId = watch("originalSaleId", initialOriginalSaleId) ?? "";
  const refundMode = watch("refundMode", "DUE_REDUCTION") ?? "DUE_REDUCTION";
  const selectedSaleQuery = useSale(originalSaleId);
  const selectedSale = selectedSaleQuery.data?.data;
  const customers = customersQuery.data?.data.items ?? [];
  const confirmedSales = selectedCustomerId
    ? (confirmedSalesQuery.data?.data.items ?? []).filter(
        (sale) => sale.customerId === selectedCustomerId,
      )
    : [];
  const activeCashAccounts = accounts.cashAccounts.filter((account) => account.isActive);
  const activeBankAccounts = accounts.bankAccounts.filter((account) => account.isActive);

  useEffect(() => {
    if (selectedSale?.sale.customerId) {
      setSelectedCustomerId(selectedSale.sale.customerId);
    }

    setReturnItems(
      (selectedSale?.items ?? []).map((item) => ({
        originalSaleItemId: item.id,
        quantity: "",
        stockCondition: "GOOD" as const,
      })),
    );
    setQuantityErrors({});
    clearErrors("items");
  }, [clearErrors, selectedSale]);

  useEffect(() => {
    if (refundMode !== "CASH") {
      setValue("cashAccountId", "");
      clearErrors("cashAccountId");
    }

    if (refundMode !== "BANK_TRANSFER") {
      setValue("bankAccountId", "");
      clearErrors("bankAccountId");
    }
  }, [clearErrors, refundMode, setValue]);

  /** Copies API field errors into React Hook Form when the server provides them. */
  function applyApiErrors(error: unknown): void {
    setFormError(readReturnError(error));

    if (!(error instanceof ApiError)) return;

    for (const fieldError of error.fieldErrors) {
      const field = fieldError.field as keyof SalesReturnFormValues;

      if (field === "originalSaleId" || field === "returnDate" || field === "reason" || field === "cashAccountId" || field === "bankAccountId") {
        setError(field, { message: fieldError.message });
      }
    }
  }

  /** Creates one confirmed Sales Return using only lines with a positive quantity. */
  async function saveSalesReturn(values: SalesReturnFormValues): Promise<void> {
    setFormError("");
    clearErrors();
    setQuantityErrors({});

    if (!selectedCustomerId) {
      setFormError("Select a customer before selecting a sale.");
      return;
    }

    if (
      !selectedSale
      || selectedSale.sale.id !== values.originalSaleId
      || selectedSale.sale.customerId !== selectedCustomerId
    ) {
      setFormError("Select a confirmed sale and wait for its items to load.");
      return;
    }

    const parsed = salesReturnFormSchema.safeParse({
      ...values,
      items: returnItems,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path.join(".");

        if (!fieldName) {
          setFormError(issue.message);
          continue;
        }

        setError(fieldName as Parameters<typeof setError>[0], {
          type: "manual",
          message: issue.message,
        });
      }
      return;
    }

    const validatedValues = parsed.data;
    const soldQuantityErrors: Record<number, string> = {};

    validatedValues.items.forEach((item, index) => {
      const saleItem = selectedSale.items[index];
      if (saleItem && exceedsSoldQuantity(item.quantity, saleItem.quantity)) {
        soldQuantityErrors[index] = `Return quantity cannot exceed sold quantity (${saleItem.quantity}).`;
      }
    });

    if (Object.keys(soldQuantityErrors).length > 0) {
      setQuantityErrors(soldQuantityErrors);
      return;
    }

    const items = validatedValues.items
      .filter((item) => Number(item.quantity) > 0)
      .map((item) => ({
        originalSaleItemId: item.originalSaleItemId,
        quantity: item.quantity.trim(),
        stockCondition: item.stockCondition,
      }));

    try {
      await createReturn.mutateAsync({
        input: {
          originalSaleId: validatedValues.originalSaleId,
          returnDate: validatedValues.returnDate,
          reason: validatedValues.reason.trim(),
          refundMode: validatedValues.refundMode as SalesReturnRefundMode,
          cashAccountId: validatedValues.refundMode === "CASH" ? validatedValues.cashAccountId : undefined,
          bankAccountId: validatedValues.refundMode === "BANK_TRANSFER" ? validatedValues.bankAccountId : undefined,
          items,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      onSaved();
    } catch (error) {
      applyApiErrors(error);
    }
  }

  return (
    <form className="management-form" onSubmit={handleSubmit(saveSalesReturn)}>
      <section className="management-card">
        <h2>Original sale</h2>
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Customer</span>
            <select
              disabled={createReturn.isPending || customersQuery.isPending}
              onChange={(event) => {
                const customerId = event.target.value;
                setSelectedCustomerId(customerId);
                setValue("originalSaleId", "");
                setReturnItems([]);
                setQuantityErrors({});
                clearErrors("originalSaleId");
                setFormError("");
              }}
              value={selectedCustomerId}
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code} · {customer.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Confirmed sale</span>
            <select
              disabled={!selectedCustomerId || createReturn.isPending || confirmedSalesQuery.isPending}
              {...register("originalSaleId")}
            >
              <option value="">{selectedCustomerId ? "Select confirmed sale" : "Select customer first"}</option>
              {confirmedSales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.invoiceNumber ?? "Confirmed sale"} · {sale.invoiceDate} · PKR {sale.totalAmount}
                </option>
              ))}
            </select>
            {errors.originalSaleId ? <small className="error-message">{errors.originalSaleId.message}</small> : null}
          </label>

          <label className="ui-field">
            <span>Return date</span>
            <input disabled={createReturn.isPending} type="date" {...register("returnDate")} />
            {errors.returnDate ? <small className="error-message">{errors.returnDate.message}</small> : null}
          </label>
        </div>

        {customersQuery.isError ? <p className="error-message">Customers could not be loaded.</p> : null}
        {selectedCustomerId && confirmedSalesQuery.isError ? <p className="error-message">Confirmed sales could not be loaded.</p> : null}
        {selectedCustomerId && !confirmedSalesQuery.isPending && !confirmedSalesQuery.isError && confirmedSales.length === 0 ? (
          <p>No confirmed sales were found for this customer.</p>
        ) : null}
        {selectedSaleQuery.isPending && originalSaleId ? <p>Loading invoice items...</p> : null}
        {selectedSaleQuery.isError ? <p className="error-message">The selected invoice could not be loaded.</p> : null}
      </section>

      {selectedSale ? (
        <section className="management-card">
          <h2>Returned items</h2>
          <p>Enter only the quantity being returned. The server checks previously returned quantities before confirmation.</p>

          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Sold qty</th>
                  <th>Price</th>
                  <th>Return qty</th>
                  <th>Condition</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((returnItem, index) => {
                  const saleItem = selectedSale.items[index];

                  if (!saleItem) return null;

                  return (
                    <tr key={saleItem.id}>
                      <td>{saleItem.productSkuSnapshot} - {saleItem.productNameSnapshot} ({saleItem.unitNameSnapshot})</td>
                      <td>{saleItem.quantity}</td>
                      <td>PKR {saleItem.manualUnitPrice}</td>
                      <td>
                        <label className="ui-field compact-money-field">
                          <span className="sr-only">Return quantity for {saleItem.productNameSnapshot}</span>
                          <input
                            disabled={createReturn.isPending}
                            inputMode="decimal"
                            onChange={(event) => {
                              const quantity = event.target.value;
                              setReturnItems((currentItems) =>
                                currentItems.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, quantity } : item,
                                ),
                              );
                              setQuantityErrors((currentErrors) => {
                                const nextErrors = { ...currentErrors };
                                if (exceedsSoldQuantity(quantity, saleItem.quantity)) {
                                  nextErrors[index] = `Return quantity cannot exceed sold quantity (${saleItem.quantity}).`;
                                } else {
                                  delete nextErrors[index];
                                }
                                return nextErrors;
                              });
                              clearErrors("items");
                            }}
                            placeholder="0.000"
                            value={returnItem.quantity}
                          />
                          {quantityErrors[index] ? (
                            <small className="error-message">{quantityErrors[index]}</small>
                          ) : errors.items?.[index]?.quantity ? (
                            <small className="error-message">{errors.items[index]?.quantity?.message}</small>
                          ) : null}
                        </label>
                      </td>
                      <td>
                        <select
                          disabled={createReturn.isPending}
                          onChange={(event) => {
                            const stockCondition = event.target.value as SalesReturnFormValues["items"][number]["stockCondition"];
                            setReturnItems((currentItems) =>
                              currentItems.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, stockCondition } : item,
                              ),
                            );
                            clearErrors("items");
                          }}
                          value={returnItem.stockCondition}
                        >
                          <option value="GOOD">Good</option>
                          <option value="DAMAGED">Damaged</option>
                          <option value="EXPIRED">Expired</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errors.items?.message ? <p className="error-message">{errors.items.message}</p> : null}
        </section>
      ) : null}

      <section className="management-card">
        <h2>Settlement</h2>
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Refund mode</span>
            <select disabled={createReturn.isPending} {...register("refundMode")}>
              <option value="DUE_REDUCTION">Customer due</option>
              <option value="CASH">Cash refund</option>
              <option value="BANK_TRANSFER">Bank refund</option>
            </select>
          </label>

          {refundMode === "CASH" ? (
            <label className="ui-field">
              <span>Cash account</span>
              <select disabled={createReturn.isPending} {...register("cashAccountId")}>
                <option value="">Select cash account</option>
                {activeCashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
              {errors.cashAccountId ? <small className="error-message">{errors.cashAccountId.message}</small> : null}
            </label>
          ) : null}

          {refundMode === "BANK_TRANSFER" ? (
            <label className="ui-field">
              <span>Bank account</span>
              <select disabled={createReturn.isPending} {...register("bankAccountId")}>
                <option value="">Select bank account</option>
                {activeBankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.bankName} - {account.accountName}</option>
                ))}
              </select>
              {errors.bankAccountId ? <small className="error-message">{errors.bankAccountId.message}</small> : null}
            </label>
          ) : null}
        </div>

        <label className="ui-field">
          <span>Return reason</span>
          <textarea disabled={createReturn.isPending} rows={3} {...register("reason")} />
          {errors.reason ? <small className="error-message">{errors.reason.message}</small> : null}
        </label>
      </section>

      {formError ? <p className="error-message">{formError}</p> : null}

      <div className="form-actions">
        <Button disabled={createReturn.isPending} label={createReturn.isPending ? "Creating..." : "Confirm Sales Return"} type="submit" />
        <Button disabled={createReturn.isPending} label="Cancel" onClick={onCancel} type="button" />
      </div>
    </form>
  );
}
