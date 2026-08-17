import { RouterProvider } from "@tanstack/react-router";

import { router } from "./router.tsx";

/** Renders the TanStack Router provider for the admin application. */
export function App(): React.JSX.Element {
  return <RouterProvider router={router} />;
}
