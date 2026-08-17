/** Contains the simple properties supported by the shared button. */
interface ButtonProps {
  label: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}

/** Renders one reusable admin action button. */
export function Button({
  label,
  type = "button",
  disabled = false,
  onClick,
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className="ui-button"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {label}
    </button>
  );
}
