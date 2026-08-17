import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import type { CustomerProfile } from "../api/customers.api.ts";

interface CustomerSummaryProps {
  profile: CustomerProfile;
}

/** Displays a nullable customer value as a readable dash. */
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

/** Shows the main customer details and calculated current due. */
export function CustomerSummary({
  profile,
}: CustomerSummaryProps): React.JSX.Element {
  const { customer } = profile;

  return (
    <section className="management-card">
      <h2>Customer details</h2>
      <dl className="detail-list">
        <div><dt>Code</dt><dd>{customer.code}</dd></div>
        <div><dt>Name</dt><dd>{customer.name}</dd></div>
        <div><dt>Phone</dt><dd>{displayValue(customer.phone)}</dd></div>
        <div><dt>Email</dt><dd>{displayValue(customer.email)}</dd></div>
        <div><dt>Address</dt><dd>{displayValue(customer.address)}</dd></div>
        <div><dt>Tax ID</dt><dd>{displayValue(customer.taxId)}</dd></div>
        <div><dt>Credit limit</dt><dd>{formatMoney(customer.creditLimit)}</dd></div>
        <div>
          <dt>Current due</dt>
          <dd>
            {profile.financialSummaryAvailable
              ? formatMoney(profile.currentDue)
              : "Unable to calculate"}
          </dd>
        </div>
        <div><dt>Type</dt><dd>{customer.isWalkIn ? "Walk-in" : "Regular"}</dd></div>
        <div><dt>Status</dt><dd><StatusBadge status={customer.isActive ? "ACTIVE" : "INACTIVE"} /></dd></div>
      </dl>

      <div className="record-information">
        <h3>Record information</h3>
        <dl className="detail-list">
          <div><dt>Created</dt><dd>{formatRecordTime(customer.createdAt)}</dd></div>
          <div><dt>Last updated</dt><dd>{formatRecordTime(customer.updatedAt)}</dd></div>
        </dl>
      </div>
    </section>
  );
}
