import { LoginForm } from "../components/login-form.tsx";

/** Displays the administrator login screen. */
export function LoginPage(): React.JSX.Element {
  return (
    <section className="auth-card">
      <p className="eyebrow">Wholesale Distributor ERP</p>
      <h1>Admin sign in</h1>
      <p>Use the administrator account created during deployment.</p>
      <LoginForm />
    </section>
  );
}
