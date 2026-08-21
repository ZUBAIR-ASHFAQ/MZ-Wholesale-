import { ApiError, type ApiErrorBody, type ApiFieldError } from "./api-types.ts";
import { readCookie } from "./utils.ts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const CSRF_COOKIE_NAME = "erp_csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const DEFAULT_ERROR_CODE = "REQUEST_FAILED";
const DEFAULT_ERROR_MESSAGE = "The request could not be completed.";

let refreshSessionPromise: Promise<boolean> | null = null;

/** Checks that one value is a plain object before reading its properties. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads valid field errors from an unknown API response value. */
function readFieldErrors(value: unknown): ApiFieldError[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const fieldErrors: ApiFieldError[] = [];

  for (const item of value) {
    if (
      isRecord(item) &&
      typeof item.field === "string" &&
      typeof item.message === "string"
    ) {
      fieldErrors.push({ field: item.field, message: item.message });
    }
  }

  return fieldErrors;
}

/** Converts an unknown failed response body to the shared typed API error body. */
function readApiErrorBody(payload: unknown): ApiErrorBody {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return {
      error: {
        code: DEFAULT_ERROR_CODE,
        message: DEFAULT_ERROR_MESSAGE,
      },
    };
  }

  const error = payload.error;
  const code =
    typeof error.code === "string" ? error.code : DEFAULT_ERROR_CODE;
  const message =
    typeof error.message === "string"
      ? error.message
      : DEFAULT_ERROR_MESSAGE;

  const directFields = readFieldErrors(error.fields);
  const detailFields = isRecord(error.details)
    ? readFieldErrors(error.details.fields)
    : [];
  const fields = directFields.length > 0 ? directFields : detailFields;

  return {
    error: {
      code,
      message,
      fields: fields.length > 0 ? fields : undefined,
    },
  };
}

/** Checks whether an HTTP method can change server state. */
function isMutation(method: string | undefined): boolean {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  return normalizedMethod !== "GET" && normalizedMethod !== "HEAD";
}

/** Reads JSON when available without hiding the original HTTP status. */
async function readResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Builds request headers, including the CSRF token for mutation requests. */
function buildHeaders(options: RequestInit): Headers {
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  if (isMutation(options.method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);

    if (csrfToken) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }

  return headers;
}

/** Sends one HTTP request and returns both its response and parsed payload. */
async function sendRequest(
  path: string,
  options: RequestInit,
): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: buildHeaders(options),
  });

  return {
    response,
    payload: await readResponsePayload(response),
  };
}

/** Checks whether a failed request is allowed to try one session refresh. */
function canRefreshRequest(path: string, response: Response): boolean {
  if (response.status !== 401) {
    return false;
  }

  return ![
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
    "/auth/change-password",
  ].includes(path);
}

/** Shares one in-flight refresh across requests and reports whether it succeeded. */
function tryRefreshSession(): Promise<boolean> {
  if (!refreshSessionPromise) {
    refreshSessionPromise = sendRequest("/auth/refresh", {
      method: "POST",
    })
      .then((refreshResult) => refreshResult.response.ok)
      .finally(() => {
        refreshSessionPromise = null;
      });
  }

  return refreshSessionPromise;
}

/** Throws the shared typed error for a failed API response. */
function throwApiError(response: Response, payload: unknown): never {
  const errorBody = readApiErrorBody(payload);

  throw new ApiError(
    errorBody.error.code,
    errorBody.error.message,
    errorBody.error.fields ?? [],
    response.status,
  );
}

/** Calls the Fastify API and retries once after a successful session refresh. */
export async function requestApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let result = await sendRequest(path, options);

  if (canRefreshRequest(path, result.response)) {
    const refreshed = await tryRefreshSession();

    if (refreshed) {
      result = await sendRequest(path, options);
    }
  }

  if (!result.response.ok) {
    throwApiError(result.response, result.payload);
  }

  return result.payload as T;
}

/** Calls the Fastify API and returns a downloadable file response. */
export async function requestApiFile(
  path: string,
  options: RequestInit = {},
): Promise<{ blob: Blob; fileName: string | null }> {
  let result = await sendRequest(path, options);

  if (canRefreshRequest(path, result.response)) {
    const refreshed = await tryRefreshSession();

    if (refreshed) {
      result = await sendRequest(path, options);
    }
  }

  if (!result.response.ok) {
    throwApiError(result.response, result.payload);
  }

  const disposition = result.response.headers.get("content-disposition") ?? "";
  const fileNameMatch = disposition.match(/filename="?([^";]+)"?/i);

  return {
    blob: await result.response.blob(),
    fileName: fileNameMatch?.[1] ?? null,
  };
}
