const BUSINESS_TIMEZONE = "Asia/Karachi";

/** Formats one instant as the ERP business date in Asia/Karachi. */
export function businessDateInKarachi(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Business date could not be created.");
  }

  return `${year}-${month}-${day}`;
}

/** Returns today's ERP business date in Asia/Karachi. */
export function currentBusinessDate(now = new Date()): string {
  return businessDateInKarachi(now);
}

/** Returns true when a validated YYYY-MM-DD business date is not in the future. */
export function isBusinessDateNotFuture(value: string): boolean {
  return value <= currentBusinessDate();
}
