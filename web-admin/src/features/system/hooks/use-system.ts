import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  confirmSystemImport,
  downloadImportTemplate,
  downloadSystemExport,
  loadSystemAuditLogs,
  loadSystemImport,
  loadSystemImports,
  validateSystemImport,
  type SystemAuditLogFilters,
  type SystemExportFilters,
  type SystemExportType,
  type SystemImportListFilters,
  type SystemImportType,
} from "../api/system.api.ts";

/** Stable cache keys used by the System feature. */
export const systemQueryKeys = {
  all: ["system"] as const,
  imports: () => ["system", "imports"] as const,
  importList: (filters: SystemImportListFilters) =>
    ["system", "imports", "list", filters] as const,
  importDetail: (importJobId: string) =>
    ["system", "imports", "detail", importJobId] as const,
  auditLogs: (filters: SystemAuditLogFilters) =>
    ["system", "audit-logs", filters] as const,
};

/** Loads one filtered page of import-job history. */
export function useSystemImports(filters: SystemImportListFilters = {}) {
  return useQuery({
    queryKey: systemQueryKeys.importList(filters),
    queryFn: () => loadSystemImports(filters),
  });
}

/** Loads one import job only when an ID is available. */
export function useSystemImport(importJobId: string) {
  return useQuery({
    queryKey: systemQueryKeys.importDetail(importJobId),
    queryFn: () => loadSystemImport(importJobId),
    enabled: importJobId.length > 0,
  });
}

/** Loads one filtered page of immutable audit logs. */
export function useSystemAuditLogs(filters: SystemAuditLogFilters = {}) {
  return useQuery({
    queryKey: systemQueryKeys.auditLogs(filters),
    queryFn: () => loadSystemAuditLogs(filters),
  });
}

interface ValidateImportVariables {
  type: SystemImportType;
  file: File;
  idempotencyKey: string;
}

/** Validates an uploaded CSV and refreshes import history/detail caches. */
export function useValidateSystemImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, file, idempotencyKey }: ValidateImportVariables) =>
      validateSystemImport(type, file, idempotencyKey),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: systemQueryKeys.imports() }),
        queryClient.setQueryData(
          systemQueryKeys.importDetail(result.job.id),
          result,
        ),
      ]);
    },
  });
}

interface ConfirmImportVariables {
  importJobId: string;
  idempotencyKey: string;
}

/** Confirms one validated import and refreshes the System import caches. */
export function useConfirmSystemImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ importJobId, idempotencyKey }: ConfirmImportVariables) =>
      confirmSystemImport(importJobId, idempotencyKey),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: systemQueryKeys.imports() }),
        queryClient.invalidateQueries({
          queryKey: systemQueryKeys.importDetail(variables.importJobId),
        }),
      ]);
    },
  });
}

/** Downloads one approved import template on demand. */
export function useDownloadImportTemplate() {
  return useMutation({
    mutationFn: (type: SystemImportType) => downloadImportTemplate(type),
  });
}

interface DownloadExportVariables {
  type: SystemExportType;
  filters?: SystemExportFilters;
}

/** Downloads one System report export without caching binary content. */
export function useDownloadSystemExport() {
  return useMutation({
    mutationFn: ({ type, filters = {} }: DownloadExportVariables) =>
      downloadSystemExport(type, filters),
  });
}
