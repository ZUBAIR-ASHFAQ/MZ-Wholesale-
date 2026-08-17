import type { ReactNode } from "react";

import { Button } from "./button.tsx";

/** Contains the simple properties supported by the shared dialog. */
interface DialogProps {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onClose(): void;
}

/** Renders modal content only while the feature keeps it open. */
export function Dialog({
  title,
  children,
  isOpen,
  onClose,
}: DialogProps): React.JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-modal="true" className="ui-dialog" role="dialog">
        <header>
          <h2>{title}</h2>
          <Button label="Close" onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
