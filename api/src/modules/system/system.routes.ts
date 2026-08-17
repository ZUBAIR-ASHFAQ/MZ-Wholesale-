import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import {
  openApiAccessSecurity,
  openApiMutationSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { executeIdempotentMutation } from "../../shared/http/idempotency.js";
import { createDataResponse } from "../../shared/http/response.js";
import {
  systemAuditLogQuerySchema,
  systemIdempotencyHeadersSchema,
  systemImportJobParamsSchema,
  systemImportListQuerySchema,
  systemImportTypeParamsSchema,
  systemExportQuerySchema,
  systemExportTypeParamsSchema,
  type SystemImportTypeParams,
} from "./system.schema.js";
import {
  buildSystemCsvExport,
  buildSystemExcelExport,
  buildSystemPdfExport,
  confirmImport,
  getImportTemplate,
  getSystemExportSource,
  listSystemAuditLogs,
  getSystemImport,
  listSystemImports,
  parseImportCsv,
  recordAuditLog,
  validateImportFile,
} from "./system.service.js";

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
]);

/** Converts Zod validation failures to the shared System validation error format. */
function parseSystemValue<T>(
  schema: ZodType<T>,
  value: unknown,
  code = "VALIDATION_ERROR",
  message = "The System request contains invalid values.",
): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const fields = result.error.issues.map((issue) => ({
    field: issue.path.length === 0 ? "request" : issue.path.map(String).join("."),
    message: issue.message,
  }));

  throw new AppError(code, message, 400, fields);
}

/** Creates a stable file fingerprint for idempotent import validation requests. */
function createImportFileHash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Keeps uploaded display names safe even when a browser submits path-like or control characters. */
function sanitizeImportFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const baseName = normalized.split("/").pop() ?? "import.csv";
  const safeName = baseName
    .replace(/[\u0000-\u001F\u007F"]/g, "_")
    .trim()
    .slice(0, 255);

  return safeName || "import.csv";
}

/** Parses an import-type path parameter and returns the approved import-type error code. */
function parseImportTypeParams(value: unknown): SystemImportTypeParams {
  return parseSystemValue(
    systemImportTypeParamsSchema,
    value,
    "UNSUPPORTED_IMPORT_TYPE",
    "The requested import type is not supported.",
  );
}

/** Reads one CSV upload into memory after applying the strict file limits for imports. */
async function readImportFile(request: FastifyRequest): Promise<{
  fileName: string;
  content: Buffer;
}> {
  if (!request.isMultipart()) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "Import requests must use multipart/form-data with one CSV file.",
      400,
    );
  }

  const part = await request.file({
    limits: {
      files: 1,
      fields: 0,
      parts: 1,
      fileSize: MAX_IMPORT_FILE_BYTES,
    },
  });

  if (!part) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "One CSV import file is required.",
      400,
    );
  }

  if (!CSV_MIME_TYPES.has(part.mimetype.toLowerCase())) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "Only CSV import files are supported.",
      400,
    );
  }

  let content: Buffer;
  try {
    content = await part.toBuffer();
  } catch (error) {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 0;

    if (statusCode === 413) {
      throw new AppError(
        "INVALID_FILE_FORMAT",
        "The import file must be 5 MB or smaller.",
        400,
      );
    }

    throw error;
  }

  return {
    fileName: sanitizeImportFileName(part.filename),
    content,
  };
}

/** Registers exactly the seven approved authenticated Module 15 System routes. */
export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  /** Downloads a header-only CSV template for one approved import type. */
  async function handleImportTemplate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = parseImportTypeParams(request.params);
    const template = getImportTemplate(params.type);

    reply
      .header("Content-Type", template.contentType)
      .header(
        "Content-Disposition",
        `attachment; filename="${template.fileName}"`,
      )
      .send(template.content);
  }

  /** Returns one filtered page of previous import jobs. */
  async function handleListImports(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseSystemValue(systemImportListQuerySchema, request.query);
    const result = await listSystemImports(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Returns one filtered page of immutable audit-log records. */
  async function handleAuditLogs(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseSystemValue(systemAuditLogQuerySchema, request.query);
    const result = await listSystemAuditLogs(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Downloads a CSV, Excel or PDF file built from the approved Reports module data. */
  async function handleExport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = parseSystemValue(
      systemExportTypeParamsSchema,
      request.params,
      "EXPORT_FILTER_INVALID",
      "The requested export type or filter is invalid.",
    );
    const query = parseSystemValue(
      systemExportQuerySchema,
      request.query,
      "EXPORT_FILTER_INVALID",
      "The requested export type or filter is invalid.",
    );
    const source = await getSystemExportSource(app.db, params.type, query);
    let file;
    if (query.format === "xlsx") {
      file = await buildSystemExcelExport(source);
    } else if (query.format === "pdf") {
      file = await buildSystemPdfExport(source);
    } else {
      file = buildSystemCsvExport(source);
    }

    reply
      .header("Content-Type", file.contentType)
      .header("Content-Disposition", `attachment; filename="${file.fileName}"`)
      .send(file.content);
  }

  /** Returns one import job together with its row-level validation errors. */
  async function handleGetImport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = parseSystemValue(systemImportJobParamsSchema, request.params);
    const result = await getSystemImport(app.db, params.id);
    reply.send(createDataResponse(result));
  }

  /** Confirms one validated master-data import using the shared idempotency transaction. */
  async function handleConfirmImport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = parseSystemValue(systemImportJobParamsSchema, request.params);
    parseSystemValue(systemIdempotencyHeadersSchema, request.headers);

    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        body: { importJobId: params.id },
      },
      async (transaction) => {
        const result = await confirmImport(transaction, params.id);
        await recordAuditLog(
          transaction,
          {
            adminUserId: request.admin?.adminUserId ?? null,
            requestId: request.id,
            ipAddress: request.ip ?? null,
            device: request.headers["user-agent"] ?? null,
          },
          "IMPORT_CONFIRMED",
          "IMPORT_JOB",
          null,
          {
            importJobId: result.job.id,
            importType: result.job.type,
            status: result.job.status,
            totalRows: result.job.totalRows,
            importedRows: result.job.importedRows,
          },
        );

        return {
          statusCode: 200,
          body: createDataResponse(result),
        };
      },
    );

    reply.status(response.statusCode).send(response.body);
  }

  /** Validates one CSV upload once and replays the saved result for matching retries. */
  async function handleImportUpload(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = parseImportTypeParams(request.params);
    parseSystemValue(systemIdempotencyHeadersSchema, request.headers);
    const file = await readImportFile(request);
    const parsed = parseImportCsv(file.fileName, file.content);
    const fileHash = createImportFileHash(file.content);

    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        body: {
          importType: params.type,
          fileName: file.fileName,
          fileHash,
        },
      },
      async (transaction) => {
        const result = await validateImportFile(transaction, params.type, parsed);
        await recordAuditLog(
          transaction,
          {
            adminUserId: request.admin?.adminUserId ?? null,
            requestId: request.id,
            ipAddress: request.ip ?? null,
            device: request.headers["user-agent"] ?? null,
          },
          result.job.status === "VALIDATED"
            ? "IMPORT_VALIDATED"
            : "IMPORT_VALIDATION_FAILED",
          "IMPORT_JOB",
          null,
          {
            importJobId: result.job.id,
            importType: result.job.type,
            fileName: result.job.fileName,
            status: result.job.status,
            totalRows: result.job.totalRows,
            validRows: result.job.validRows,
            errorRows: result.job.errorRows,
          },
        );

        return {
          statusCode: 200,
          body: createDataResponse(result),
        };
      },
    );

    reply.status(response.statusCode).send(response.body);
  }

  app.get(
    "/system/import-templates/:type",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["system"],
        summary: "Download import template",
        security: openApiAccessSecurity,
        response: {
          ...openApiPrivateErrors,
        },
      },
    },
    handleImportTemplate,
  );

  app.post(
    "/system/imports/:type",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["system"],
        summary: "Validate import file",
        consumes: ["multipart/form-data"],
        security: openApiMutationSecurity,
        response: {
          200: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    },
    handleImportUpload,
  );

  app.get(
    "/system/imports",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["system"],
        summary: "List import jobs",
        security: openApiAccessSecurity,
        response: {
          200: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    },
    handleListImports,
  );

  app.get(
    "/system/imports/:id",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["system"],
        summary: "Load import job result",
        security: openApiAccessSecurity,
        response: {
          200: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    },
    handleGetImport,
  );

  app.get(
    "/system/audit-logs",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["system"],
        summary: "List audit logs",
        security: openApiAccessSecurity,
        response: {
          200: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    },
    handleAuditLogs,
  );

  app.get(
    "/system/exports/:type",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["system"],
        summary: "Download CSV, Excel or PDF report export",
        security: openApiAccessSecurity,
        response: {
          200: { type: "string", format: "binary" },
          ...openApiPrivateErrors,
        },
      },
    },
    handleExport,
  );

  app.post(
    "/system/imports/:id/confirm",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["system"],
        summary: "Confirm validated import",
        security: openApiMutationSecurity,
        response: {
          200: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    },
    handleConfirmImport,
  );
}
