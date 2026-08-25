import { ImportHistory } from "../components/import-history.tsx";
import { ImportWorkflow } from "../components/import-workflow.tsx";

/** Hosts opening/master-data import workflow and saved import history. */
export function ImportsPage(): React.JSX.Element {
  return (
    <section>
      <p className="eyebrow">System tools</p>
      <h1>Opening data import</h1>
      <p>
        Download a template, validate the completed CSV, review every row error,
        and confirm only a successful validation.
      </p>

      <ImportWorkflow />
      <ImportHistory />
    </section>
  );
}
