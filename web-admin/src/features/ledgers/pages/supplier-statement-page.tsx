import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { LedgerStatementFilters } from "../api/ledgers.api.ts";
import { LedgerStatementTable } from "../components/ledger-statement-table.tsx";
import { LedgerSummary } from "../components/ledger-summary.tsx";
import { useSupplierStatement } from "../hooks/use-ledgers.ts";

interface SupplierStatementPageProps {
  supplierId: string;
}

const pageSize = 20;

/** Shows one supplier's immutable payable statement. */
export function SupplierStatementPage({
  supplierId,
}: SupplierStatementPageProps): React.JSX.Element {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedDates, setAppliedDates] = useState({ startDate: "", endDate: "" });
  const [page, setPage] = useState(1);

  const filters: LedgerStatementFilters = {
    startDate: appliedDates.startDate || undefined,
    endDate: appliedDates.endDate || undefined,
    page,
    pageSize,
  };
  const statementQuery = useSupplierStatement(supplierId, filters);
  const statement = statementQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((statement?.total ?? 0) / pageSize));

  /** Applies the dates. */
  function applyDates(): void {
    setAppliedDates({ startDate, endDate });
    setPage(1);
  }

  /** Clears the statement date filters and returns to the first page. */
  function clearDates(): void {
    setStartDate("");
    setEndDate("");
    setAppliedDates({ startDate: "", endDate: "" });
    setPage(1);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Supplier Ledger</p>
          <h1>{statement?.supplier.name ?? "Supplier statement"}</h1>
          <p>Review the opening payable, debits, credits and closing payable.</p>
        </div>
        <Link className="text-link" params={{ supplierId }} to="/suppliers/$supplierId">
          Supplier profile
        </Link>
      </div>

      <section className="management-card">
        <div className="ledger-filter-row">
          <label className="ui-field">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="ui-field">
            <span>End date</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <div className="form-actions ledger-filter-actions">
            <Button disabled={statementQuery.isFetching} label="Apply" onClick={applyDates} />
            <Button disabled={statementQuery.isFetching} label="Clear" onClick={clearDates} />
          </div>
        </div>

        {statementQuery.isPending ? <p>Loading supplier statement...</p> : null}
        {statementQuery.isError ? <p className="error-message">Could not load the supplier statement.</p> : null}

        {statement ? (
          <>
            <p><strong>{statement.supplier.code}</strong> · {statement.supplier.phone ?? "No phone"}</p>
            <LedgerSummary
              closingBalance={statement.closingBalance}
              closingLabel="Closing payable"
              openingBalance={statement.openingBalance}
              totalCredit={statement.totalCredit}
              totalDebit={statement.totalDebit}
            />
            <LedgerStatementTable entries={statement.entries} />
            <div className="pagination-row">
              <p>Page {page} of {totalPages} · {statement.total} entries</p>
              <div className="form-actions">
                <Button disabled={page <= 1 || statementQuery.isFetching} label="Previous" onClick={() => setPage((value) => Math.max(1, value - 1))} />
                <Button disabled={page >= totalPages || statementQuery.isFetching} label="Next" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} />
              </div>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
