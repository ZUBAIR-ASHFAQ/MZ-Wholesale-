/** Reads one browser cookie value by its exact name. */
export function readCookie(cookieName: string): string | null {
  const cookieParts = document.cookie.split(";");

  for (const cookiePart of cookieParts) {
    const [name, ...valueParts] = cookiePart.trim().split("=");

    if (name === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

/** Returns today's business date in the fixed Asia/Karachi timezone. */
export function currentBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Business date could not be created.");
  }

  return `${year}-${month}-${day}`;
}

/** Formats a decimal money value using the ERP's fixed PKR currency. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return `PKR ${String(value)}`;
  }

  return `PKR ${numericValue.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Formats a quantity with up to three decimal places without unnecessary trailing zeros. */
export function formatQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return numericValue.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/** Formats one business date using the required Asia/Karachi reporting timezone. */
export function formatBusinessDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Formats one timestamp using the required Asia/Karachi reporting timezone. */
export function formatBusinessDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Converts a backend enum value into a readable label for the admin UI. */
export function formatStatusLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
