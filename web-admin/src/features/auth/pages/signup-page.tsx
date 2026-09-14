import { Link } from "@tanstack/react-router";

import { SignupForm } from "../components/signup-form.tsx";

/** Displays public account creation for an independent ERP workspace. */
export function SignupPage(): React.JSX.Element {
  return (
    <section className="auth-card">
      <p className="eyebrow">Wholesale Distributor ERP</p>
      <h1>Create your account</h1>
      <p>Your business data stays separate from every other account.</p>
      <SignupForm />
      <p>
        Already have an account?{` `}
        <Link className="primary-link" to="/login">
          Sign in
        </Link>
      </p>
    </section>
  );
}
