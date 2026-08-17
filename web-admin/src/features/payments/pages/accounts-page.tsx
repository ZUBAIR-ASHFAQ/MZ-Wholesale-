import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import type { BankAccount, CashAccount } from "../api/payments.api.ts";
import { BankAccountForm, CashAccountForm } from "../components/account-form.tsx";
import { BankAccountsTable, CashAccountsTable } from "../components/accounts-table.tsx";
import { usePaymentAccounts, useUpdateBankAccount, useUpdateCashAccount } from "../hooks/use-payments.ts";

type AccountDialog = "CASH" | "BANK" | null;

/** Shows cash and bank accounts with balances calculated from movements. */
export function AccountsPage(): React.JSX.Element {
  const accountsQuery = usePaymentAccounts();
  const updateCash = useUpdateCashAccount();
  const updateBank = useUpdateBankAccount();
  const [dialog, setDialog] = useState<AccountDialog>(null);
  const [cashAccount, setCashAccount] = useState<CashAccount | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const accounts = accountsQuery.data?.data;

  /** Opens the cash-account form for creation. */
  function openNewCashAccount(): void {
    setCashAccount(null);
    setDialog("CASH");
  }

  /** Opens the bank-account form for creation. */
  function openNewBankAccount(): void {
    setBankAccount(null);
    setDialog("BANK");
  }

  /** Opens the cash-account form for editing. */
  function editCashAccount(account: CashAccount): void {
    setCashAccount(account);
    setDialog("CASH");
  }

  /** Opens the bank-account form for editing. */
  function editBankAccount(account: BankAccount): void {
    setBankAccount(account);
    setDialog("BANK");
  }

  /** Closes either account form. */
  function closeDialog(): void {
    setDialog(null);
    setCashAccount(null);
    setBankAccount(null);
  }

  /** Activates or deactivates one cash account. */
  function toggleCashAccount(account: CashAccount): void {
    updateCash.mutate({ accountId: account.id, input: { isActive: !account.isActive } });
  }

  /** Activates or deactivates one bank account. */
  function toggleBankAccount(account: BankAccount): void {
    updateBank.mutate({ accountId: account.id, input: { isActive: !account.isActive } });
  }

  return (
    <section>
      <div className="page-heading-row">
        <div><p className="eyebrow">Payments</p><h1>Cash and bank accounts</h1><p>Account balances are calculated from immutable money movements.</p></div>
        <div className="form-actions"><Button label="Add cash account" onClick={openNewCashAccount} /><Button label="Add bank account" onClick={openNewBankAccount} /></div>
      </div>

      {accountsQuery.isPending ? <p>Loading accounts...</p> : null}
      {accountsQuery.isError ? <p className="error-message">Could not load payment accounts.</p> : null}
      {accounts ? <>
        <section className="management-card"><h2>Cash accounts</h2><CashAccountsTable accounts={accounts.cashAccounts} isUpdating={updateCash.isPending} onEdit={editCashAccount} onToggle={toggleCashAccount} /></section>
        <section className="management-card"><h2>Bank accounts</h2><BankAccountsTable accounts={accounts.bankAccounts} isUpdating={updateBank.isPending} onEdit={editBankAccount} onToggle={toggleBankAccount} /></section>
      </> : null}

      <Dialog isOpen={dialog === "CASH"} onClose={closeDialog} title={cashAccount ? "Edit cash account" : "Add cash account"}><CashAccountForm account={cashAccount} onFinished={closeDialog} /></Dialog>
      <Dialog isOpen={dialog === "BANK"} onClose={closeDialog} title={bankAccount ? "Edit bank account" : "Add bank account"}><BankAccountForm account={bankAccount} onFinished={closeDialog} /></Dialog>
    </section>
  );
}
