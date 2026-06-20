import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import "./index.css";

import { ThemeProvider } from "@/components/theme-providers";
import ErrorBoundary from "@/components/error-boundary";
import { MarmotProvider } from "@/hooks/use-marmot";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <BrowserRouter basename={import.meta.env.VITE_BASE_PATH}>
          <MarmotProvider>
            <App />
          </MarmotProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
