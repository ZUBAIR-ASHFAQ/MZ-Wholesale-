import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import { useProductMovements } from "../hooks/use-inventory.ts";

interface ProductMovementsPageProps {
  productId: string;
}

const pageSize = 20;

/** Formats a saved timestamp for the administrator's browser locale. */
function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

/** Converts an internal movement value into a readable UI label. */
function movementLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Shows the saved source as a readable link when the source has a detail page. */
function movementSource(
  sourceType: string | null,
  sourceId: string | null,
): React.JSX.Element | string {
  if (!sourceType || !sourceId) {
    return "Manual";
  }

  const label = movementLabel(sourceType);

  switch (sourceType) {
    case "SALE":
      return (
        <Link className="table-link" params={{ saleId: sourceId }} to="/sales/$saleId">
          {label}
        </Link>
      );
    case "PURCHASE":
      return (
        <Link
          className="table-link"
          params={{ purchaseId: sourceId }}
          to="/purchases/$purchaseId"
        >
          {label}
        </Link>
      );
    case "SALES_RETURN":
      return (
        <Link
          className="table-link"
          params={{ salesReturnId: sourceId }}
          to="/returns/sales/$salesReturnId"
        >
          {label}
        </Link>
      );
    case "PURCHASE_RETURN":
      return (
        <Link
          className="table-link"
          params={{ purchaseReturnId: sourceId }}
          to="/returns/purchases/$purchaseReturnId"
        >
          {label}
        </Link>
      );
    case "STOCK_COUNT":
      return (
        <Link
          className="table-link"
          params={{ countId: sourceId }}
          to="/inventory/counts/$countId"
        >
          {label}
        </Link>
      );
    default:
      return label;
  }
}

/** Displays immutable movement history for one product. */
export function ProductMovementsPage({
  productId,
}: ProductMovementsPageProps): React.JSX.Element {
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const movementsQuery = useProductMovements(productId, {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    pageSize,
  });
  const result = movementsQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies date filters and returns to the first page. */
  function applyFilters(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
    setPage(1);
  }

  /** Clears movement date filters. */
  function resetFilters(): void {
    setDraftStartDate("");
    setDraftEndDate("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Inventory Management</p>
          <h1>Stock movements</h1>
          <p>Every saved stock change is shown as an immutable movement.</p>
        </div>
        <Link className="secondary-link" to="/inventory">
          Back to inventory
        </Link>
      </div>

      <section className="management-card inventory-list-card">
        <form className="movement-filters" onSubmit={applyFilters}>
          <label className="ui-field" htmlFor="movement-start-date">
            <span>Start date</span>
            <input
              id="movement-start-date"
              onChange={(event) => setDraftStartDate(event.target.value)}
              type="date"
              value={draftStartDate}
            />
          </label>
          <label className="ui-field" htmlFor="movement-end-date">
            <span>End date</span>
            <input
              id="movement-end-date"
              onChange={(event) => setDraftEndDate(event.target.value)}
              type="date"
              value={draftEndDate}
            />
          </label>
          <div className="form-actions">
            <Button
              disabled={movementsQuery.isFetching}
              label="Apply filters"
              type="submit"
            />
            <Button
              disabled={movementsQuery.isFetching}
              label="Reset"
              onClick={resetFilters}
            />
          </div>
        </form>

        {movementsQuery.isPending ? <p>Loading movements...</p> : null}
        {movementsQuery.isError ? (
          <p className="error-message">Could not load stock movements.</p>
        ) : null}

        {result?.items.length === 0 ? <p>No movements were found.</p> : null}

        {result && result.items.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table movement-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Condition</th>
                  <th>Direction</th>
                  <th>Quantity</th>
                  <th>Unit cost</th>
                  <th>Allocated extra cost</th>
                  <th>Source</th>
                  <th>Reason</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDateTime(movement.occurredAt)}</td>
                    <td>{movementLabel(movement.movementType)}</td>
                    <td>{movementLabel(movement.stockCondition)}</td>
                    <td>{movementLabel(movement.direction)}</td>
                    <td>{movement.quantity}</td>
                    <td>{formatMoney(movement.unitCost)}</td>
                    <td>
                      {movement.allocatedExtraCost === null
                        ? "—"
                        : `PKR ${movement.allocatedExtraCost}`}
                    </td>
                    <td>{movementSource(movement.sourceType, movement.sourceId)}</td>
                    <td>{movement.reason ? movementLabel(movement.reason) : "—"}</td>
                    <td>{movement.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {page} of {totalPages} · {result.total} movements
            </p>
            <div className="form-actions">
              <Button
                disabled={page <= 1 || movementsQuery.isFetching}
                label="Previous"
                onClick={() => setPage((current) => current - 1)}
              />
              <Button
                disabled={page >= totalPages || movementsQuery.isFetching}
                label="Next"
                onClick={() => setPage((current) => current + 1)}
              />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
