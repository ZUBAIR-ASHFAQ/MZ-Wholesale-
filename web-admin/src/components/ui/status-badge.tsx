import { formatStatusLabel } from "../../lib/utils.ts";

interface StatusBadgeProps {
  status: string;
  label?: string;
}

/** Displays one compact, consistently styled business status. */
export function StatusBadge({ status, label }: StatusBadgeProps): React.JSX.Element {
  const className = `status-badge ${status.toLowerCase().replaceAll("_", "-")}`;

  return <span className={className}>{label ?? formatStatusLabel(status)}</span>;
}
