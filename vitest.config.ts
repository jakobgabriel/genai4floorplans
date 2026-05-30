/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Single root test run across all workspaces. @flowplan/core resolves to source
// via its package "exports" map (wildcard → ./src/*.ts), so no build step is
// needed to test. Per-file `// @vitest-environment jsdom` opts the web DOM tests
// into jsdom; everything else runs in node.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
  },
});
