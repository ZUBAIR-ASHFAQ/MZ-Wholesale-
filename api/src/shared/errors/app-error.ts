/** Describes one safe validation field returned to a form. */
export interface AppErrorField {
  field: string;
  message: string;
}

/** Contains the safe fields used by the shared application error handler. */
export interface AppErrorDetails {
  statusCode: number;
  code: string;
  message: string;
  fields?: AppErrorField[];
}

/** Carries one safe application failure from business code to Fastify. */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly fields?: AppErrorField[];

  /** Saves the stable code, readable message, HTTP status and optional fields. */
  constructor(
    code: string,
    message: string,
    statusCode: number,
    fields?: AppErrorField[],
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

/** Reads safe application error fields without trusting unknown values. */
export function readAppError(error: unknown): AppErrorDetails | null {
  if (!(error instanceof AppError)) {
    return null;
  }

  return {
    statusCode: error.statusCode,
    code: error.code,
    message: error.message,
    fields: error.fields,
  };
}
