/** Checks that an unknown value contains visible text. */
export function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
