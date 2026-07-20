import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ui";
// Carbon first, then the app's own tokens: Carbon's reset touches html/body, and
// the existing editor theme must keep winning there. Carbon components are all
// .cds--* scoped, so they are unaffected by loading order.
import "@carbon/styles/css/styles.min.css";
import "./planner/planner.css";
import "./styles/tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
