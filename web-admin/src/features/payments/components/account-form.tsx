import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { BankAccount, CashAccount } from "../api/payments.api.ts";
import {
  useCreateBankAccount,
  useCreateCashAccount,
  useUpdateBankAccount,
  useUpdateCashAccount,
} from "../hooks/use-payments.ts";

const moneyPattern = /^\d{1,12}(\.\d{1,2})?$/;

const cashAccountSchema = z.object({
  name: z.string().trim().min(1, "Cash account name is required.").max(120),
  openingBalance: z.string().regex(moneyPattern, "Enter a valid amount with up to 2 decimals."),
});

const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1, "Bank name is required.").max(120),
  accountName: z.string().trim().min(1, "Account name is required.").max(120),
  accountNumber: z.string().trim().min(1, "Account number is required.").max(80),
  openingBalance: z.string().regex(moneyPattern, "Enter a valid amount with up to 2 decimals."),
});

type CashAccountValues = z.infer<typeof cashAccountSchema>;
type BankAccountValues = z.infer<typeof bankAccountSchema>;

interface CashAccountFormProps {
  account: CashAccount | null;
  onFinished(): void;
}

/** Reads a clear message from an API or unexpected form error. */
function readError(error: unknown): string {
  return error instanceof ApiError ? error.message : "The account could not be saved.";
}

/** Creates or renames one cash account. */
export function CashAccountForm({
  account,
  onFinished,
}: CashAccountFormProps): React.JSX.Element {
  const createAccount = useCreateCashAccount();
  const updateAccount = useUpdateCashAccount();
  const isSaving = createAccount.isPending || updateAccount.isPending;
  const form = useForm<CashAccountValues>({
    resolver: zodResolver(cashAccountSchema),
    defaultValues: { name: "", openingBalance: "0.00" },
  });
  const { reset } = form;

  useEffect(() => {
    reset({ name: account?.name ?? "", openingBalance: "0.00" });
  }, [account, reset]);

  /** Saves the validated cash account values. */
  async function handleSubmit(values: CashAccountValues): Promise<void> {
    try {
      if (account) {
        await updateAccount.mutateAsync({ accountId: account.id, input: { name: values.name.trim() } });
      } else {
        await createAccount.mutateAsync({
          name: values.name.trim(),
          openingBalance: values.openingBalance,
        });
      }
      onFinished();
    } catch (error) {
      form.setError("root", { message: readError(error) });
    }
  }

  return (
    <form className="management-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <label className="ui-field">
        <span>Cash account name</span>
        <input {...form.register("name")} />
        {form.formState.errors.name ? <small>{form.formState.errors.name.message}</small> : null}
      </label>
      {!account ? (
        <label className="ui-field">
          <span>Opening balance</span>
          <input inputMode="decimal" {...form.register("openingBalance")} />
          {form.formState.errors.openingBalance ? <small>{form.formState.errors.openingBalance.message}</small> : null}
        </label>
      ) : null}
      {form.formState.errors.root ? <p className="error-message">{form.formState.errors.root.message}</p> : null}
      <div className="form-actions">
        <Button disabled={isSaving} label={isSaving ? "Saving..." : account ? "Save changes" : "Create cash account"} type="submit" />
        <Button label="Cancel" onClick={onFinished} />
      </div>
    </form>
  );
}

interface BankAccountFormProps {
  account: BankAccount | null;
  onFinished(): void;
}

/** Creates or updates one bank account. */
export function BankAccountForm({
  account,
  onFinished,
}: BankAccountFormProps): React.JSX.Element {
  const createAccount = useCreateBankAccount();
  const updateAccount = useUpdateBankAccount();
  const isSaving = createAccount.isPending || updateAccount.isPending;
  const form = useForm<BankAccountValues>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: { bankName: "", accountName: "", accountNumber: "", openingBalance: "0.00" },
  });
  const { reset } = form;

  useEffect(() => {
    reset({
      bankName: account?.bankName ?? "",
      accountName: account?.accountName ?? "",
      accountNumber: account?.accountNumber ?? "",
      openingBalance: "0.00",
    });
  }, [account, reset]);

  /** Saves the validated bank account values. */
  async function handleSubmit(values: BankAccountValues): Promise<void> {
    try {
      if (account) {
        await updateAccount.mutateAsync({
          accountId: account.id,
          input: {
            bankName: values.bankName.trim(),
            accountName: values.accountName.trim(),
            accountNumber: values.accountNumber.trim(),
          },
        });
      } else {
        await createAccount.mutateAsync({
          bankName: values.bankName.trim(),
          accountName: values.accountName.trim(),
          accountNumber: values.accountNumber.trim(),
          openingBalance: values.openingBalance,
        });
      }
      onFinished();
    } catch (error) {
      form.setError("root", { message: readError(error) });
    }
  }

  return (
    <form className="management-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <label className="ui-field"><span>Bank name</span><input {...form.register("bankName")} />{form.formState.errors.bankName ? <small>{form.formState.errors.bankName.message}</small> : null}</label>
      <label className="ui-field"><span>Account name</span><input {...form.register("accountName")} />{form.formState.errors.accountName ? <small>{form.formState.errors.accountName.message}</small> : null}</label>
      <label className="ui-field"><span>Account number</span><input {...form.register("accountNumber")} />{form.formState.errors.accountNumber ? <small>{form.formState.errors.accountNumber.message}</small> : null}</label>
      {!account ? <label className="ui-field"><span>Opening balance</span><input inputMode="decimal" {...form.register("openingBalance")} />{form.formState.errors.openingBalance ? <small>{form.formState.errors.openingBalance.message}</small> : null}</label> : null}
      {form.formState.errors.root ? <p className="error-message">{form.formState.errors.root.message}</p> : null}
      <div className="form-actions">
        <Button disabled={isSaving} label={isSaving ? "Saving..." : account ? "Save changes" : "Create bank account"} type="submit" />
        <Button label="Cancel" onClick={onFinished} />
      </div>
    </form>
  );
}
