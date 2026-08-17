/** Contains one validation error that can be displayed beside a form field. */
export interface ApiFieldError {
  field: string;
  message: string;
}

/** Contains the stable error information returned by the Fastify API. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: ApiFieldError[];
    details?: {
      fields?: ApiFieldError[];
    };
  };
}

/** Contains the common successful API response envelope. */
export interface ApiSuccess<T> {
  data: T;
}

/** Represents an API failure while preserving details needed by forms. */
export class ApiError extends Error {
  public readonly code: string;
  public readonly fieldErrors: ApiFieldError[];
  public readonly status: number;

  public constructor(
    code: string,
    message: string,
    fieldErrors: ApiFieldError[],
    status: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.status = status;
  }
}
