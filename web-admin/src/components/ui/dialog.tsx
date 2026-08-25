import { useEffect, type MouseEvent, type ReactNode } from "react";

/** Contains the simple properties supported by the shared dialog. */
interface DialogProps {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  wide?: boolean;
  onClose(): void;
}

/** Renders modal content only while the feature keeps it open. */
export function Dialog({
  title,
  children,
  isOpen,
  wide = false,
  onClose,
}: DialogProps): React.JSX.Element | null {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  /** Closes only when the backdrop itself is clicked. */
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <section
        aria-modal="true"
        className={wide ? "ui-dialog ui-dialog-wide" : "ui-dialog"}
        role="dialog"
      >
        <header>
          <h2>{title}</h2>
        </header>
        {children}
      </section>
    </div>
  );
}
