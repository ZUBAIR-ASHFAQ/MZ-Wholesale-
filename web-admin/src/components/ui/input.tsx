import type { ChangeEvent } from "react";

/** Contains the simple properties supported by the shared text input. */
interface InputProps {
  id: string;
  label: string;
  value: string;
  type?: "email" | "password" | "text";
  autoComplete?: string;
  onChange(value: string): void;
}

/** Renders a labeled reusable input and reports its latest text value. */
export function Input({
  id,
  label,
  value,
  type = "text",
  autoComplete,
  onChange,
}: InputProps): React.JSX.Element {
  /** Sends only the input text back to the feature component. */
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  return (
    <label className="ui-field" htmlFor={id}>
      <span>{label}</span>
      <input
        autoComplete={autoComplete}
        id={id}
        onChange={handleChange}
        type={type}
        value={value}
      />
    </label>
  );
}
