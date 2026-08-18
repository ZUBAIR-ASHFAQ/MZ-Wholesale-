import type { ReactNode } from "react";

/** Contains the public page displayed by the authentication layout. */
interface AuthLayoutProps {
  children: ReactNode;
}

/** Presents authentication in the same focused wholesale-counter visual system as the private ERP. */
export function AuthLayout({ children }: AuthLayoutProps): React.JSX.Element {
  return (
    <main className="auth-layout">
      <section className="auth-layout-panel">
        <div className="auth-layout-inner">{children}</div>
      </section>
      <aside className="auth-layout-visual" aria-hidden="true">
        <div>
          <p className="auth-visual-eyebrow">Focused wholesale counter ERP</p>
          <h2>Fast counter work. Traceable stock. Controlled cash.</h2>
          <p>
            One production workspace for counter sales, purchasing, stock,
            customer and supplier dues, cash controls, and owner reports.
          </p>
          <div className="auth-visual-metrics">
            <div>
              <strong>15</strong>
              <span>Business areas</span>
            </div>
            <div>
              <strong>PKR</strong>
              <span>Fixed currency</span>
            </div>
            <div>
              <strong>1</strong>
              <span>Admin operator</span>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
