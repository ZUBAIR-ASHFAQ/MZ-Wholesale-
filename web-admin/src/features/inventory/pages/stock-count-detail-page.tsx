import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { StockCountItemsTable } from "../components/stock-count-items-table.tsx";
import {
  useConfirmStockCount,
  useStockCount,
} from "../hooks/use-inventory.ts";

interface StockCountDetailPageProps {
  stockCountId: string;
}

/** Formats a saved timestamp for the stock-count summary. */
function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Displays one stock count and allows final confirmation while it is a draft. */
export function StockCountDetailPage({
  stockCountId,
}: StockCountDetailPageProps): React.JSX.Element {
  const countQuery = useStockCount(stockCountId);
  const confirmMutation = useConfirmStockCount();
  const [confirmError, setConfirmError] = useState("");
  const detail = countQuery.data?.data;

  /** Confirms the count after the administrator accepts the final warning. */
  async function confirmCount(): Promise<void> {
    const accepted = window.confirm(
      "Confirm this stock count? Inventory balances and stock movements will be updated, and the count cannot be edited again.",
    );

    if (!accepted) {
      return;
    }

    setConfirmError("");

    try {
      await confirmMutation.mutateAsync(stockCountId);
    } catch (error) {
      setConfirmError(
        error instanceof ApiError
          ? error.message
          : "The stock count could not be confirmed.",
      );
    }
  }

  if (countQuery.isPending) {
    return <p>Loading stock count...</p>;
  }

  if (countQuery.isError || !detail) {
    return <p className="error-message">The stock count could not be loaded.</p>;
  }

  const stockCount = detail.stockCount;

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Inventory Management</p>
          <h1>{stockCount.countNumber}</h1>
          <p>Review saved quantities and confirm the final inventory corrections.</p>
        </div>
        <div className="form-actions">
          <Link className="secondary-link" to="/inventory/counts">
            Back to counts
          </Link>
          {stockCount.status === "DRAFT" ? (
            <Link
              className="secondary-link"
              params={{ countId: stockCount.id }}
              to="/inventory/counts/$countId/edit"
            >
              Edit draft
            </Link>
          ) : null}
          {stockCount.status === "DRAFT" ? (
            <Button
              disabled={confirmMutation.isPending}
              label={confirmMutation.isPending ? "Confirming..." : "Confirm count"}
              onClick={() => void confirmCount()}
            />
          ) : null}
        </div>
      </div>

      <section className="management-card stock-count-summary">
        <div>
          <strong>Status</strong>
          <p>{stockCount.status === "DRAFT" ? "Draft" : "Confirmed"}</p>
        </div>
        <div>
          <strong>Count date</strong>
          <p>{stockCount.countDate}</p>
        </div>
        <div>
          <strong>Confirmed at</strong>
          <p>{formatDateTime(stockCount.confirmedAt)}</p>
        </div>
        <div>
          <strong>Notes</strong>
          <p>{stockCount.notes || "—"}</p>
        </div>
      </section>

      {stockCount.status === "DRAFT" ? (
        <p className="warning-message">
          Confirmation updates inventory balances, creates immutable stock movements,
          and permanently locks this count.
        </p>
      ) : null}
      {confirmError ? <p className="error-message">{confirmError}</p> : null}

      <section className="management-card">
        <h2>Count items</h2>
        <StockCountItemsTable items={detail.items} />
      </section>
    </section>
  );
}
