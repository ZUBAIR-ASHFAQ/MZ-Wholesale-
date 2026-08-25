import { useState } from "react";

import { currentBusinessDate, formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { LaborCostSummaryReportFilters } from "../api/reports.api.ts";
import { ReportDateRangeFilter, type ReportDateRangeFilterValues } from "../components/report-filters.tsx";
import { useLaborCostSummaryReport } from "../hooks/use-reports.ts";

function currentMonthDates(): ReportDateRangeFilterValues {
  const endDate = currentBusinessDate();
  return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
}

/** Shows confirmed payroll labor cost while keeping advance repayment outside labor expense. */
export function LaborCostSummaryReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] = useState<ReportDateRangeFilterValues>(currentMonthDates);
  const [filters, setFilters] = useState<LaborCostSummaryReportFilters>(currentMonthDates);
  const reportQuery = useLaborCostSummaryReport(filters);
  const report = reportQuery.data?.data;

  function resetFilters(): void { const next = currentMonthDates(); setDraftDates(next); setFilters(next); }

  return <section>
    <div className="page-heading-row"><div><p className="eyebrow">Reports</p><h1>Labor cost summary</h1><p>Review confirmed payroll labor cost. Advance recovery is shown separately and is not treated as a labor-cost reduction.</p></div></div>
    <section className="management-card"><ReportDateRangeFilter disabled={reportQuery.isFetching} onApply={() => setFilters(draftDates)} onChange={setDraftDates} onReset={resetFilters} values={draftDates} /></section>
    <section className="management-card">
      {reportQuery.isPending ? <p>Loading labor cost summary...</p> : null}
      {reportQuery.isError ? <p className="error-message">Could not load the labor cost summary.</p> : null}
      {report ? <><div className="summary-grid"><article className="summary-card"><span>Confirmed payroll runs</span><strong>{report.payrollRunCount}</strong></article><article className="summary-card"><span>Employee payroll rows</span><strong>{report.employeeCount}</strong></article><article className="summary-card"><span>Net salary</span><strong>{formatMoney(report.netSalaryAmount)}</strong></article><article className="summary-card"><span>Advance recovery</span><strong>{formatMoney(report.advanceRecoveryAmount)}</strong></article><article className="summary-card"><span>Labor cost</span><strong>{formatMoney(report.laborCostAmount)}</strong></article></div><div className="table-scroll"><table className="ui-table"><thead><tr><th>Payroll</th><th>Period</th><th>Employees</th><th>Net salary</th><th>Advance recovery</th><th>Labor cost</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.payrollRunId}><td>{row.payrollNumber}</td><td>{formatBusinessDate(row.periodStart)} – {formatBusinessDate(row.periodEnd)}</td><td>{row.employeeCount}</td><td>{formatMoney(row.netSalaryAmount)}</td><td>{formatMoney(row.advanceRecoveryAmount)}</td><td><strong>{formatMoney(row.laborCostAmount)}</strong></td></tr>)}</tbody></table></div>{report.rows.length === 0 ? <p>No confirmed payroll matched this date range.</p> : null}</> : null}
    </section>
  </section>;
}
