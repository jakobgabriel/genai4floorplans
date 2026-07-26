import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tests run from the repo-root vitest.config.ts across all workspaces.
// @flowplan/core resolves to source via its package "exports" map.
//
// Dev proxy: the web dev server (5173) forwards /api to the API server (4000)
// so the app is same-origin in dev and the session cookie flows. Override the
// target with VITE_API_TARGET. Run both with `npm run dev:all`.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the vendor libraries out of the app chunk. They change far less
        // often than the app, so a returning user re-downloads only the small
        // app chunk on each deploy rather than one large blob. Carbon is by far
        // the largest dependency, so it gets its own chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@carbon")) return "carbon";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          return "vendor";
        },
      },
    },
  },
});
