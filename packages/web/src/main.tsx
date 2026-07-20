import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ui";
import { bootstrapSession } from "./store/bootstrap";
// Carbon first, then the app's own tokens: Carbon's reset touches html/body, and
// the existing editor theme must keep winning there. Carbon components are all
// .cds--* scoped, so they are unaffected by loading order.
import "@carbon/styles/css/styles.min.css";
import "./planner/planner.css";
import "./styles/tokens.css";

const root = createRoot(document.getElementById("root")!);
root.render(<div style={{ padding: "2rem", fontFamily: "'IBM Plex Sans',sans-serif", color: "#8d8d8d" }}>Loading workspace…</div>);

// Establish the DB-backed session (auto-login the seeded dev user in dev), then
// render. If the API is unreachable the app still renders in its localStorage
// fallback rather than blocking.
bootstrapSession().finally(() => {
  root.render(
    <StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StrictMode>,
  );
});
