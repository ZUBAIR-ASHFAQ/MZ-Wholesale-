import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { ZodError } from "zod";

import type { AppErrorField } from "../shared/errors/app-error.js";
import { readAppError } from "../shared/errors/app-error.js";
import { createErrorResponse } from "../shared/http/response.js";

/** Converts one Zod path to the field name shown by forms. */
function readFieldName(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "request";
  }

  return path.map(String).join(".");
}

/** Converts Zod issues to safe readable validation fields. */
function readValidationFields(error: ZodError): AppErrorField[] {
  return error.issues.map(
    /** Builds one readable field from a trusted Zod validation issue. */
    function createField(issue) {
      return {
        field: readFieldName(issue.path),
        message: issue.message,
      };
    },
  );
}

/** Reads a PostgreSQL value from an error or its wrapped cause. */
function readPostgresValue(
  error: unknown,
  property: "code" | "constraint",
  depth = 0,
): string | null {
  if (depth >= 3 || typeof error !== "object" || error === null) {
    return null;
  }

  if (property in error && typeof error[property] === "string") {
    return error[property];
  }

  if ("cause" in error) {
    return readPostgresValue(error.cause, property, depth + 1);
  }

  return null;
}

type UniqueConstraintError = {
  statusCode: number;
  code: string;
  message: string;
  fields?: AppErrorField[];
};

/** Builds one safe field error for a database uniqueness conflict. */
function uniqueField(field: string, message: string): AppErrorField[] {
  return [{ field, message }];
}

/** Converts known PostgreSQL unique constraints to stable API business errors. */
function readUniqueConstraintError(
  error: unknown,
): UniqueConstraintError | null {
  if (readPostgresValue(error, "code") !== "23505") {
    return null;
  }

  const constraint = readPostgresValue(error, "constraint");

  switch (constraint) {
    case "document_sequences_prefix_unique":
      return {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "The request contains invalid fields.",
        fields: uniqueField(
          "sequences.prefix",
          "Prefix is already used by another document sequence.",
        ),
      };
    case "document_sequences_document_type_unique":
      return {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "The request contains invalid fields.",
        fields: uniqueField(
          "sequences.documentType",
          "Document type already has a saved sequence.",
        ),
      };
    case "product_categories_name_normalized_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_CATEGORY_NAME",
        message: "Category name already exists.",
        fields: uniqueField("name", "Category name already exists."),
      };
    case "brands_name_normalized_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_BRAND_NAME",
        message: "Brand name already exists.",
        fields: uniqueField("name", "Brand name already exists."),
      };
    case "products_sku_normalized_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_SKU",
        message: "SKU is already used by another product.",
        fields: uniqueField("sku", "SKU is already used by another product."),
      };
    case "products_barcode_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_BARCODE",
        message: "Barcode is already used by another product.",
        fields: uniqueField(
          "barcode",
          "Barcode is already used by another product.",
        ),
      };
    case "product_units_product_unit_name_normalized_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_PRODUCT_UNIT",
        message: "Unit name already exists for this product.",
        fields: uniqueField(
          "units",
          "Unit name already exists for this product.",
        ),
      };
    case "customers_code_normalized_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_CUSTOMER_CODE",
        message: "Customer code already exists.",
        fields: uniqueField("code", "Customer code already exists."),
      };
    case "suppliers_code_normalized_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_SUPPLIER_CODE",
        message: "Supplier code already exists.",
        fields: uniqueField("code", "Supplier code already exists."),
      };
    case "cash_accounts_name_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_ACCOUNT",
        message: "Cash account name already exists.",
        fields: uniqueField("name", "Cash account name already exists."),
      };
    case "bank_accounts_account_number_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_ACCOUNT",
        message: "Bank account number already exists.",
        fields: uniqueField(
          "accountNumber",
          "Bank account number already exists.",
        ),
      };
    case "expense_categories_name_normalized_unique":
      return {
        statusCode: 409,
        code: "DUPLICATE_EXPENSE_CATEGORY",
        message: "An expense category with this name already exists.",
        fields: uniqueField(
          "name",
          "An expense category with this name already exists.",
        ),
      };
    default:
      return null;
  }
}

/** Installs one safe fallback error response for unexpected route failures. */
export function installErrorHandlerPlugin(app: FastifyInstance): void {
  /** Converts an unhandled error to a safe shared response envelope. */
  function handleError(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const safeError = readAppError(error);

    if (safeError) {
      reply
        .status(safeError.statusCode)
        .send(
          createErrorResponse(
            safeError.code,
            safeError.message,
            safeError.fields,
          ),
        );
      return;
    }

    if (error instanceof ZodError) {
      reply
        .status(400)
        .send(
          createErrorResponse(
            "VALIDATION_ERROR",
            "The request contains invalid fields.",
            readValidationFields(error),
          ),
        );
      return;
    }

    const uniqueConstraintError = readUniqueConstraintError(error);

    if (uniqueConstraintError) {
      reply
        .status(uniqueConstraintError.statusCode)
        .send(
          createErrorResponse(
            uniqueConstraintError.code,
            uniqueConstraintError.message,
            uniqueConstraintError.fields,
          ),
        );
      return;
    }

    app.log.error(
      {
        errorName: error.name,
        method: request.method,
        requestId: request.id,
        url: request.url,
      },
      "Unhandled API error.",
    );
    reply
      .status(500)
      .send(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "The request could not be completed.",
        ),
      );
  }

  app.setErrorHandler(handleError);
}
