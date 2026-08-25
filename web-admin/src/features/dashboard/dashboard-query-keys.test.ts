import { describe, expect, it } from "vitest";

import { dashboardQueryKeys } from "./hooks/use-dashboard.ts";

describe("dashboardQueryKeys", () => {
  it("changes the overview cache key when the selected business date changes", () => {
    const firstDateKey = dashboardQueryKeys.overview({ date: "2026-08-08" });
    const secondDateKey = dashboardQueryKeys.overview({ date: "2026-08-09" });

    expect(firstDateKey).not.toEqual(secondDateKey);
    expect(firstDateKey).toEqual([
      "dashboard",
      "overview",
      { date: "2026-08-08" },
    ]);
  });

  it("keeps low-stock pages in separate cache entries", () => {
    expect(dashboardQueryKeys.lowStock(1)).toEqual([
      "dashboard",
      "low-stock",
      1,
    ]);
    expect(dashboardQueryKeys.lowStock(2)).not.toEqual(
      dashboardQueryKeys.lowStock(1),
    );
  });
});
