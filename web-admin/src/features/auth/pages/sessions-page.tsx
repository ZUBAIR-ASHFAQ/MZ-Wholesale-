import { SessionList } from "../components/session-list.tsx";

/** Shows active administrator sessions and session-revocation controls. */
export function SessionsPage(): React.JSX.Element {
  return (
    <section>
      <p className="eyebrow">Account security</p>
      <h1>Active sessions</h1>
      <p>Review active administrator sessions and sign out sessions you no longer trust.</p>
      <SessionList />
    </section>
  );
}
