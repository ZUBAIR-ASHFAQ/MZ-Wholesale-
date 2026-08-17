import { useQuery } from "@tanstack/react-query";

import {
  loadDashboardOverview,
  type DashboardOverviewFilters,
} from "../api/dashboard.api.ts";

/** Stable cache keys used by Dashboard queries. */
export const dashboardQueryKeys = {
  all: ["dashboard"] as const,
  overview: (filters: DashboardOverviewFilters) =>
    ["dashboard", "overview", filters] as const,
};

/** Loads the read-only Dashboard overview for the selected business date. */
export function useDashboardOverview(
  filters: DashboardOverviewFilters = {},
) {
  return useQuery({
    queryKey: dashboardQueryKeys.overview(filters),
    queryFn: () => loadDashboardOverview(filters),
  });
}
