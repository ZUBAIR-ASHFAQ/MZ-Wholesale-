import { BusinessSettingsForm } from "../components/business-settings-form.tsx";
import { useBusinessSettings } from "../hooks/use-business-settings.ts";

/** Formats one stored timestamp in the ERP reporting timezone. */
function formatRecordTime(value: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

/** Loads and displays the editable permanent business settings. */
export function BusinessSettingsPage(): React.JSX.Element {
  const settingsQuery = useBusinessSettings();

  if (settingsQuery.isPending) {
    return <p>Loading business settings...</p>;
  }

  if (settingsQuery.error) {
    return <p className="error-message">{settingsQuery.error.message}</p>;
  }

  const data = settingsQuery.data.data;

  return (
    <section>
      <p className="eyebrow">Module 1</p>
      <h1>Business settings</h1>
      <BusinessSettingsForm data={data} />

      {data.settings ? (
        <section className="management-card record-information-card">
          <h2>Record information</h2>
          <dl className="detail-list">
            <div><dt>Currency</dt><dd>{data.settings.currency}</dd></div>
            <div><dt>Reporting timezone</dt><dd>{data.settings.timezone}</dd></div>
            <div><dt>Created</dt><dd>{formatRecordTime(data.settings.createdAt)}</dd></div>
            <div><dt>Last updated</dt><dd>{formatRecordTime(data.settings.updatedAt)}</dd></div>
          </dl>
        </section>
      ) : null}
    </section>
  );
}
