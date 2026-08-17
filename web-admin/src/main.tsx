import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/app.tsx";
import { Providers } from "./app/providers.tsx";
import "./styles/globals.css";

/** Starts React inside the root element supplied by index.html. */
function startAdminApplication(): void {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("The React root element is missing.");
  }

  createRoot(rootElement).render(
    <StrictMode>
      <Providers>
        <App />
      </Providers>
    </StrictMode>,
  );
}

startAdminApplication();
