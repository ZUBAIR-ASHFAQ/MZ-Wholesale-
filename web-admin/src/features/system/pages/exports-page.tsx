import { ExportWorkflow } from "../components/export-workflow.tsx";

/** Hosts report exports while reusing the existing Reports module calculations. */
export function ExportsPage(): React.JSX.Element {
  return (
    <section>
      <p className="eyebrow">System tools</p>
      <h1>Exports</h1>
      <p>
        Choose a report, apply its supported filters, and download the same report data as CSV, Excel, or PDF.
      </p>

      <ExportWorkflow />
    </section>
  );
}
