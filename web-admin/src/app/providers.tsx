import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { queryClient } from "../lib/query-client.ts";

/** Contains the React tree wrapped by application-wide providers. */
interface ProvidersProps {
  children: ReactNode;
}

/** Adds the shared TanStack Query client to the React tree. */
export function Providers({ children }: ProvidersProps): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
