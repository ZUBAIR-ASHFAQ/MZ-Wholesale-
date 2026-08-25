import { QueryClient } from "@tanstack/react-query";

/** Shared query cache used by every admin feature. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
