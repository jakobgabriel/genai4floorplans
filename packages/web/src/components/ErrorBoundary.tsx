import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * A last-resort boundary so a render error shows a recovery screen instead of a
 * blank page. The likeliest cause now that the route pages are lazy is a chunk
 * that failed to fetch — a flaky network, or a redeploy that changed chunk
 * hashes while the tab stayed open — so that case is named and offered a reload,
 * which re-fetches the current bundle. Anything else is reported as unexpected.
 *
 * Uses native markup and the already-loaded Carbon stylesheet's classes rather
 * than app components, so it can still render when part of the tree is broken.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the stack for diagnostics; the UI stays friendly.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const isChunk = /Loading chunk|dynamically imported module|ChunkLoadError|module script failed/i.test(
      error.message,
    );
    return (
      <div className="wrap">
        <div className="page">
          <h1 className="page-title">{isChunk ? "This page needs a reload" : "Something went wrong"}</h1>
          <p className="u-muted">
            {isChunk
              ? "Part of the app couldn’t be loaded — this usually means a new version was deployed while this tab was open."
              : "An unexpected error interrupted the page. Reloading should recover it; your saved work stays in this browser."}
          </p>
          <button type="button" className="cds--btn cds--btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
