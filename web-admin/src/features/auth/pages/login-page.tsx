import { Link } from "@tanstack/react-router";

import { LoginForm } from "../components/login-form.tsx";

/** Displays the administrator login screen. */
export function LoginPage(): React.JSX.Element {
  return (
    <section className="auth-card">
      <p className="eyebrow">Wholesale Distributor ERP</p>
      <h1>Sign in</h1>
      <p>Use the credentials for your own account.</p>
      <LoginForm />
      <p>
        Need an account?{` `}
        <Link className="primary-link" to="/signup">
          Create one
        </Link>
      </p>
    </section>
  );
}
