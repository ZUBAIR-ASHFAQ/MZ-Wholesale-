import { AuditLogHistory } from "../components/audit-log-history.tsx";

/** Hosts the read-only audit-log viewer for important ERP activity. */
export function AuditLogsPage(): React.JSX.Element {
  return (
    <section>
      <p className="eyebrow">System tools</p>
      <h1>Audit logs</h1>
      <p>
        Review important business and security actions with request, admin, device,
        and before/after details.
      </p>

      <AuditLogHistory />
    </section>
  );
}
