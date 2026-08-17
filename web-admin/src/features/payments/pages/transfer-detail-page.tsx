import { Link } from "@tanstack/react-router";

import type { CashBankTransfer, PaymentAccounts } from "../api/payments.api.ts";
import { usePaymentAccounts, useTransfer } from "../hooks/use-payments.ts";

interface TransferDetailPageProps {
  transferId: string;
}

/** Finds the readable source account name for one transfer. */
function sourceAccountName(
  transfer: CashBankTransfer,
  accounts: PaymentAccounts | undefined,
): string {
  if (transfer.sourceMethod === "CASH") {
    return accounts?.cashAccounts.find((account) => account.id === transfer.sourceCashAccountId)?.name ?? "Cash account";
  }

  const account = accounts?.bankAccounts.find((item) => item.id === transfer.sourceBankAccountId);
  return account ? `${account.bankName} - ${account.accountName}` : "Bank account";
}

/** Finds the readable destination account name for one transfer. */
function destinationAccountName(
  transfer: CashBankTransfer,
  accounts: PaymentAccounts | undefined,
): string {
  if (transfer.destinationMethod === "CASH") {
    return accounts?.cashAccounts.find((account) => account.id === transfer.destinationCashAccountId)?.name ?? "Cash account";
  }

  const account = accounts?.bankAccounts.find((item) => item.id === transfer.destinationBankAccountId);
  return account ? `${account.bankName} - ${account.accountName}` : "Bank account";
}

/** Shows one immutable transfer and its source and destination accounts. */
export function TransferDetailPage({ transferId }: TransferDetailPageProps): React.JSX.Element {
  const transferQuery = useTransfer(transferId);
  const accountsQuery = usePaymentAccounts();
  const transfer = transferQuery.data?.data;

  if (transferQuery.isPending || accountsQuery.isPending) return <p>Loading transfer...</p>;
  if (transferQuery.isError || !transfer) return <p className="error-message">Could not load this transfer.</p>;

  return (
    <section>
      <p className="eyebrow">Payments</p>
      <h1>Transfer details</h1>
      <p>This confirmed transfer is immutable and linked to two account movements.</p>
      <section className="management-card">
        <dl className="detail-list">
          <div><dt>Transfer ID</dt><dd>{transfer.id}</dd></div>
          <div><dt>Date</dt><dd>{new Date(transfer.transferDate).toLocaleDateString()}</dd></div>
          <div><dt>Source</dt><dd>{sourceAccountName(transfer, accountsQuery.data?.data)}</dd></div>
          <div><dt>Destination</dt><dd>{destinationAccountName(transfer, accountsQuery.data?.data)}</dd></div>
          <div><dt>Amount</dt><dd>PKR {transfer.amount}</dd></div>
          <div><dt>Notes</dt><dd>{transfer.notes || "—"}</dd></div>
          <div><dt>Created</dt><dd>{new Date(transfer.createdAt).toLocaleString()}</dd></div>
        </dl>
      </section>
      <Link className="primary-link" to="/payments/transfers">Back to transfers</Link>
    </section>
  );
}
