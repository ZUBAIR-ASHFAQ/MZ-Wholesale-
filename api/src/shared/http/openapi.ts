/** Describes the shared success envelope without restricting its data payload. */
export const openApiSuccessResponse = {
  type: "object",
  required: ["data"],
  properties: {
    data: {},
  },
};

/** Describes the shared error envelope returned by the global error handler. */
export const openApiErrorResponse = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        fields: {
          type: "array",
          items: {
            type: "object",
            required: ["field", "message"],
            properties: {
              field: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
};

/** Lists the common documented error responses used by private routes. */
export const openApiPrivateErrors = {
  400: openApiErrorResponse,
  401: openApiErrorResponse,
  403: openApiErrorResponse,
  404: openApiErrorResponse,
  409: openApiErrorResponse,
  429: openApiErrorResponse,
  500: openApiErrorResponse,
};

/** Requires the access-session cookie in the generated OpenAPI document. */
export const openApiAccessSecurity = [{ accessCookie: [] }];

/** Requires access authentication and a CSRF header for documented mutations. */
export const openApiMutationSecurity = [
  { accessCookie: [], csrfHeader: [] },
];
