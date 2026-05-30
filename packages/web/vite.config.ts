import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tests run from the repo-root vitest.config.ts across all workspaces.
// @flowplan/core resolves to source via its package "exports" map.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
