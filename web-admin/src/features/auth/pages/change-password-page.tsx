import { ChangePasswordForm } from "../components/change-password-form.tsx";

/** Shows the administrator password-change workflow. */
export function ChangePasswordPage(): React.JSX.Element {
  return (
    <section>
      <p className="eyebrow">Account security</p>
      <h1>Change password</h1>
      <p>Changing your password signs out every active session.</p>
      <ChangePasswordForm />
    </section>
  );
}
