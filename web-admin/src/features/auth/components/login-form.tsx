import { useState, type FormEvent } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Input } from "../../../components/ui/input.tsx";
import { useLoginAdmin } from "../hooks/use-auth.ts";

/** Renders the two-field administrator login form. */
export function LoginForm(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLoginAdmin();

  /** Submits credentials without placing them in the browser URL. */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <Input
        autoComplete="username"
        id="email"
        label="Email"
        onChange={setEmail}
        type="email"
        value={email}
      />
      <Input
        autoComplete="current-password"
        id="password"
        label="Password"
        onChange={setPassword}
        type="password"
        value={password}
      />
      {login.error ? <p className="error-message">{login.error.message}</p> : null}
      <Button
        disabled={login.isPending}
        label={login.isPending ? "Signing in..." : "Sign in"}
        type="submit"
      />
    </form>
  );
}
