/** Builds the common successful API response envelope. */
export function createDataResponse(data: unknown): { data: unknown } {
  return { data };
}

/** Builds the common safe API error response envelope. */
export function createErrorResponse(
  code: string,
  message: string,
  fields?: { field: string; message: string }[],
): {
  error: {
    code: string;
    message: string;
    fields?: { field: string; message: string }[];
  };
} {
  return {
    error: {
      code,
      message,
      fields,
    },
  };
}
