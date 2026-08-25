import { afterEach, describe, expect, test, vi } from "vitest";

import { requestApi, requestApiFile } from "./api-client.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("API client session refresh", () => {
  test("shares one in-flight refresh across concurrent requests", async () => {
    let releaseRefresh = (): void => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const requestCalls = new Map<string, number>();
    let refreshCalls = 0;

    vi.stubGlobal("document", { cookie: "erp_csrf_token=test-csrf-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname;

        if (path === "/auth/refresh") {
          refreshCalls += 1;
          await refreshGate;
          return jsonResponse(200, { data: {} });
        }

        const callCount = (requestCalls.get(path) ?? 0) + 1;
        requestCalls.set(path, callCount);

        if (callCount === 1) {
          return jsonResponse(401, {
            error: { code: "UNAUTHENTICATED", message: "Session expired." },
          });
        }

        if (path === "/exports/file") {
          return new Response("report", {
            status: 200,
            headers: { "content-type": "text/csv" },
          });
        }

        return jsonResponse(200, { data: { path } });
      }),
    );

    const jsonRequest = requestApi<{ data: { path: string } }>("/reports/one");
    const fileRequest = requestApiFile("/exports/file");

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(refreshCalls).toBe(1);
    releaseRefresh();

    const [jsonResult, fileResult] = await Promise.all([jsonRequest, fileRequest]);

    expect(refreshCalls).toBe(1);
    expect(requestCalls.get("/reports/one")).toBe(2);
    expect(requestCalls.get("/exports/file")).toBe(2);
    expect(jsonResult.data.path).toBe("/reports/one");
    expect(await fileResult.blob.text()).toBe("report");

    await requestApi("/reports/later");
    expect(refreshCalls).toBe(2);
  });
});
