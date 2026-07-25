import { useEffect, useState } from "react";

// Minimal dependency-free hash router. Routes are the part after '#':
// "/" (editor), "/analysis", "/assistant", "/report", "/compare", "/site",
// "/admin", "/archive". Deep links and the browser back/forward button work
// because we just read/write location.hash.
export type Route = "/" | "/analysis" | "/assistant" | "/report" | "/compare" | "/site" | "/admin" | "/archive" | "/library";

function current(): Route {
  const h = (window.location.hash.slice(1) || "/") as Route;
  return (["/", "/analysis", "/assistant", "/report", "/compare", "/site", "/admin", "/archive", "/library"] as string[]).includes(h) ? h : "/";
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    const on = () => {
      setRoute(current());
      // A hash change does not reset scroll, so a page opened from a scrolled
      // one started part-way down — the report opened with its own cover
      // already hidden behind its sticky header.
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (r: Route) => { window.location.hash = r; }];
}

export function navigate(r: Route): void {
  window.location.hash = r;
}
