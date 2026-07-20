import { useEffect, useState } from "react";

// Minimal dependency-free hash router. Routes are the part after '#':
// "/" (editor), "/compare", "/site", "/admin", "/archive". Deep links and the
// browser back/forward button work because we just read/write location.hash.
export type Route = "/" | "/workspace" | "/library" | "/compare" | "/site" | "/admin" | "/archive";

function current(): Route {
  const h = (window.location.hash.slice(1) || "/") as Route;
  return (["/", "/workspace", "/library", "/compare", "/site", "/admin", "/archive"] as string[]).includes(h) ? h : "/";
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    const on = () => setRoute(current());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (r: Route) => { window.location.hash = r; }];
}

export function navigate(r: Route): void {
  window.location.hash = r;
}
