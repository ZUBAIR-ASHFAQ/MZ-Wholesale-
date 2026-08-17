import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import type { BankAccount, CashAccount } from "../api/payments.api.ts";

interface CashAccountsTableProps {
  accounts: CashAccount[];
  isUpdating: boolean;
  onEdit(account: CashAccount): void;
  onToggle(account: CashAccount): void;
}

/** Shows cash accounts with calculated balances and simple actions. */
export function CashAccountsTable({
  accounts,
  isUpdating,
  onEdit,
  onToggle,
}: CashAccountsTableProps): React.JSX.Element {
  if (accounts.length === 0) return <p>No cash accounts have been created.</p>;

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead><tr><th>Name</th><th>Opening</th><th>Current balance</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.id}>
              <td>{account.name}</td><td>{formatMoney(account.openingBalance)}</td><td>{formatMoney(account.balance)}</td><td><StatusBadge status={account.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td><div className="form-actions"><Button label="Edit" onClick={() => onEdit(account)} /><Button disabled={isUpdating} label={account.isActive ? "Deactivate" : "Activate"} onClick={() => onToggle(account)} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BankAccountsTableProps {
  accounts: BankAccount[];
  isUpdating: boolean;
  onEdit(account: BankAccount): void;
  onToggle(account: BankAccount): void;
}

/** Shows bank accounts with calculated balances and simple actions. */
export function BankAccountsTable({
  accounts,
  isUpdating,
  onEdit,
  onToggle,
}: BankAccountsTableProps): React.JSX.Element {
  if (accounts.length === 0) return <p>No bank accounts have been created.</p>;

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead><tr><th>Bank</th><th>Account</th><th>Number</th><th>Opening</th><th>Current balance</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.id}>
              <td>{account.bankName}</td><td>{account.accountName}</td><td>{account.accountNumber}</td><td>{formatMoney(account.openingBalance)}</td><td>{formatMoney(account.balance)}</td><td><StatusBadge status={account.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td><div className="form-actions"><Button label="Edit" onClick={() => onEdit(account)} /><Button disabled={isUpdating} label={account.isActive ? "Deactivate" : "Activate"} onClick={() => onToggle(account)} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
