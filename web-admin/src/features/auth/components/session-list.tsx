import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import {
  useAdminSessions,
  useLogoutAllAdminSessions,
  useRevokeAdminSession,
} from "../hooks/use-auth.ts";

/** Formats one session timestamp in the business timezone. */
function formatSessionTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Displays active sessions and the necessary revoke controls. */
export function SessionList(): React.JSX.Element {
  const sessionsQuery = useAdminSessions();
  const revokeSession = useRevokeAdminSession();
  const logoutAll = useLogoutAllAdminSessions();
  const sessions = sessionsQuery.data?.data.sessions ?? [];

  /** Confirms and revokes one selected session. */
  function handleRevoke(sessionId: string, currentSession: boolean): void {
    const message = currentSession
      ? "Revoke this current session? You will need to sign in again."
      : "Revoke this active session?";

    if (window.confirm(message)) {
      revokeSession.mutate(sessionId);
    }
  }

  /** Confirms and revokes every active administrator session. */
  function handleLogoutAll(): void {
    if (window.confirm("Sign out every active session? You will need to sign in again.")) {
      logoutAll.mutate();
    }
  }

  const queryError =
    sessionsQuery.error instanceof ApiError ? sessionsQuery.error : null;
  const revokeError =
    revokeSession.error instanceof ApiError ? revokeSession.error : null;
  const logoutAllError =
    logoutAll.error instanceof ApiError ? logoutAll.error : null;
  const actionError = revokeError ?? logoutAllError;

  if (sessionsQuery.isPending) {
    return <p className="page-status">Loading active sessions...</p>;
  }

  if (queryError) {
    return <p className="error-message">{queryError.message}</p>;
  }

  return (
    <div>
      <div className="page-actions">
        <Button
          disabled={logoutAll.isPending || sessions.length === 0}
          label={logoutAll.isPending ? "Signing out all..." : "Sign out all sessions"}
          onClick={handleLogoutAll}
        />
      </div>

      {actionError ? <p className="error-message">{actionError.message}</p> : null}

      {sessions.length === 0 ? (
        <p>No active sessions were found.</p>
      ) : (
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Expires</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.currentSession ? "Current session" : "Active session"}</td>
                  <td>{formatSessionTime(session.createdAt)}</td>
                  <td>{formatSessionTime(session.lastUsedAt)}</td>
                  <td>{formatSessionTime(session.expiresAt)}</td>
                  <td>
                    <Button
                      disabled={revokeSession.isPending || logoutAll.isPending}
                      label={session.currentSession ? "Sign out" : "Revoke"}
                      onClick={() => handleRevoke(session.id, session.currentSession)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
