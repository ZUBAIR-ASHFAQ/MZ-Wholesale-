import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  loadBusinessSettings,
  saveBusinessSettings,
} from "../api/business-settings.api.ts";

const businessSettingsQueryKey = ["business-settings"] as const;

/** Loads the business settings through TanStack Query. */
export function useBusinessSettings() {
  return useQuery({
    queryKey: businessSettingsQueryKey,
    queryFn: loadBusinessSettings,
  });
}

/** Saves settings and reloads the latest server values after success. */
export function useSaveBusinessSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveBusinessSettings,
    /** Refreshes the settings screen after the API accepts the update. */
    async onSuccess(): Promise<void> {
      await queryClient.invalidateQueries({ queryKey: businessSettingsQueryKey });
    },
  });
}
