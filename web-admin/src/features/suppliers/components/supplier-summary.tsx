import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import type { SupplierProfile } from "../api/suppliers.api.ts";

interface SupplierSummaryProps {
  profile: SupplierProfile;
}

/** Displays a nullable supplier value as a readable dash. */
function displayValue(value: string | null): string {
  return value ?? "—";
}

/** Formats one stored timestamp in the ERP reporting timezone. */
function formatRecordTime(value: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

/** Shows the main supplier details and current payable status. */
export function SupplierSummary({
  profile,
}: SupplierSummaryProps): React.JSX.Element {
  const { supplier } = profile;

  return (
    <section className="management-card">
      <h2>Supplier details</h2>
      <dl className="detail-list">
        <div><dt>Code</dt><dd>{supplier.code}</dd></div>
        <div><dt>Name</dt><dd>{supplier.name}</dd></div>
        <div><dt>Phone</dt><dd>{displayValue(supplier.phone)}</dd></div>
        <div><dt>Email</dt><dd>{displayValue(supplier.email)}</dd></div>
        <div><dt>Address</dt><dd>{displayValue(supplier.address)}</dd></div>
        <div><dt>Tax ID</dt><dd>{displayValue(supplier.taxId)}</dd></div>
        <div>
          <dt>Current payable</dt>
          <dd>
            {profile.financialSummaryAvailable
              ? formatMoney(profile.currentPayable)
              : "Available after Ledger module"}
          </dd>
        </div>
        <div><dt>Status</dt><dd><StatusBadge status={supplier.isActive ? "ACTIVE" : "INACTIVE"} /></dd></div>
      </dl>

      <div className="record-information">
        <h3>Record information</h3>
        <dl className="detail-list">
          <div><dt>Created</dt><dd>{formatRecordTime(supplier.createdAt)}</dd></div>
          <div><dt>Last updated</dt><dd>{formatRecordTime(supplier.updatedAt)}</dd></div>
        </dl>
      </div>
    </section>
  );
}
