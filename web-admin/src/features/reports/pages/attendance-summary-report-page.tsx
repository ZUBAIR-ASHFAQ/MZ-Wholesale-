import { useState } from "react";

import { currentBusinessDate } from "../../../lib/utils.ts";
import type { AttendanceSummaryReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { useAttendanceSummaryReport } from "../hooks/use-reports.ts";

function currentMonthDates(): ReportDateRangeFilterValues {
  const endDate = currentBusinessDate();
  return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
}

/** Shows attendance status counts grouped by employee for one business-date range. */
export function AttendanceSummaryReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] = useState<ReportDateRangeFilterValues>(currentMonthDates);
  const [filters, setFilters] = useState<AttendanceSummaryReportFilters>(currentMonthDates);
  const reportQuery = useAttendanceSummaryReport(filters);
  const report = reportQuery.data?.data;

  function resetFilters(): void {
    const next = currentMonthDates();
    setDraftDates(next);
    setFilters(next);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Attendance summary</h1>
          <p>Review recorded attendance totals by employee for the selected business-date range.</p>
        </div>
      </div>
      <section className="management-card">
        <ReportDateRangeFilter disabled={reportQuery.isFetching} onApply={() => setFilters(draftDates)} onChange={setDraftDates} onReset={resetFilters} values={draftDates} />
      </section>
      <section className="management-card">
        {reportQuery.isPending ? <p>Loading attendance summary...</p> : null}
        {reportQuery.isError ? <p className="error-message">Could not load the attendance summary.</p> : null}
        {report ? (
          <>
            <div className="table-scroll">
              <table className="ui-table">
                <thead><tr><th>Code</th><th>Employee</th><th>Present</th><th>Absent</th><th>Half day</th><th>Leave</th><th>Holiday</th><th>Weekly off</th><th>Worked hours</th></tr></thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.employeeId}>
                      <td>{row.employeeCode}</td><td>{row.employeeName}</td><td>{row.presentDays}</td><td>{row.absentDays}</td><td>{row.halfDays}</td><td>{row.leaveDays}</td><td>{row.holidayDays}</td><td>{row.weeklyOffDays}</td><td>{row.workedHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.rows.length === 0 ? <p>No attendance records matched this date range.</p> : null}
          </>
        ) : null}
      </section>
    </section>
  );
}
