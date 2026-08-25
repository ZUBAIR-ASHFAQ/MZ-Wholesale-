import { useState } from "react";

import { currentBusinessDate, formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { PayrollRegisterReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { usePayrollRegisterReport } from "../hooks/use-reports.ts";

function currentMonthDates(): ReportDateRangeFilterValues {
  const endDate = currentBusinessDate();
  return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
}

/** Shows immutable confirmed Payroll Items for the selected Payroll period-end range. */
export function PayrollRegisterReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] = useState<ReportDateRangeFilterValues>(currentMonthDates);
  const [filters, setFilters] = useState<PayrollRegisterReportFilters>(currentMonthDates);
  const reportQuery = usePayrollRegisterReport(filters);
  const report = reportQuery.data?.data;

  function resetFilters(): void {
    const next = currentMonthDates();
    setDraftDates(next);
    setFilters(next);
  }

  return (
    <section>
      <div className="page-heading-row"><div><p className="eyebrow">Reports</p><h1>Payroll register</h1><p>Review immutable employee snapshots from confirmed payroll runs only.</p></div></div>
      <section className="management-card">
        <ReportDateRangeFilter disabled={reportQuery.isFetching} onApply={() => setFilters(draftDates)} onChange={setDraftDates} onReset={resetFilters} values={draftDates} />
      </section>
      <section className="management-card">
        {reportQuery.isPending ? <p>Loading payroll register...</p> : null}
        {reportQuery.isError ? <p className="error-message">Could not load the payroll register.</p> : null}
        {report ? (
          <>
            <div className="table-scroll"><table className="ui-table">
              <thead><tr><th>Payroll</th><th>Period</th><th>Code</th><th>Employee</th><th>Base salary</th><th>Gross</th><th>Attendance deduction</th><th>Additions</th><th>Deductions</th><th>Advance recovery</th><th>Net salary</th></tr></thead>
              <tbody>{report.rows.map((row) => <tr key={row.payrollItemId}><td>{row.payrollNumber}</td><td>{formatBusinessDate(row.periodStart)} – {formatBusinessDate(row.periodEnd)}</td><td>{row.employeeCode}</td><td>{row.employeeName}</td><td>{formatMoney(row.baseSalary)}</td><td>{formatMoney(row.grossSalary)}</td><td>{formatMoney(row.attendanceDeduction)}</td><td>{formatMoney(row.additionsAmount)}</td><td>{formatMoney(row.deductionsAmount)}</td><td>{formatMoney(row.advanceRecoveryAmount)}</td><td>{formatMoney(row.netSalary)}</td></tr>)}</tbody>
            </table></div>
            {report.rows.length === 0 ? <p>No confirmed payroll rows matched this date range.</p> : null}
          </>
        ) : null}
      </section>
    </section>
  );
}
