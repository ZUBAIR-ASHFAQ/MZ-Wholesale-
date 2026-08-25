/** Checks an unsigned decimal against PostgreSQL-style precision and scale limits. */
function isUnsignedDecimalWithinPrecision(
  value: string,
  integerDigits: number,
  decimalPlaces: number,
): boolean {
  const match = value.match(/^(\d+)(?:\.(\d+))?$/);

  if (!match) {
    return false;
  }

  const wholePart = match[1].replace(/^0+(?=\d)/, "");
  const fractionalPart = match[2] ?? "";

  return wholePart.length <= integerDigits && fractionalPart.length <= decimalPlaces;
}

/** Checks a value that will be stored as PostgreSQL numeric(14,2). */
export function isMoneyWithinDatabaseRange(value: string): boolean {
  return isUnsignedDecimalWithinPrecision(value, 12, 2);
}

/** Checks a value that will be stored as PostgreSQL numeric(14,3). */
export function isQuantityWithinDatabaseRange(value: string): boolean {
  return isUnsignedDecimalWithinPrecision(value, 11, 3);
}


/** Returns true when an unsigned decimal is exactly zero without floating-point conversion. */
export function isDecimalZero(value: string): boolean {
  return /^0+(?:\.0+)?$/.test(value.trim());
}

/** Returns true when an unsigned decimal is greater than zero without floating-point conversion. */
export function isDecimalGreaterThanZero(value: string): boolean {
  const normalizedValue = value.trim();

  if (!/^\d+(?:\.\d+)?$/.test(normalizedValue)) {
    return false;
  }

  return /[1-9]/.test(normalizedValue);
}

/** Returns true when an unsigned decimal is exactly one without floating-point conversion. */
export function isDecimalOne(value: string): boolean {
  return /^0*1(?:\.0+)?$/.test(value.trim());
}
