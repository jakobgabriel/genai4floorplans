import type { Model } from "@flowplan/core/model/types";
import { modelToJSON } from "@flowplan/core/io/json";

// Browser-only download helpers (the DOM half of the old io/json.ts; the pure
// parse/serialize lives in @flowplan/core/io).
export function downloadJSON(model: Model): void {
  const blob = new Blob([modelToJSON(model)], { type: "application/json" });
  triggerDownload(blob, (model.name || "layout").replace(/\s+/g, "_") + ".json");
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
