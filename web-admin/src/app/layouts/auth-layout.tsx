import type { ReactNode } from "react";

/** Contains the public page displayed by the authentication layout. */
interface AuthLayoutProps {
  children: ReactNode;
}

/** Centers public authentication pages without the private navigation. */
export function AuthLayout({ children }: AuthLayoutProps): React.JSX.Element {
  return (
    <main className="auth-layout">
      {children}
    </main>
  );
}
