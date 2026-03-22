import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const isStaticDemo = process.env.VITE_STATIC_DEMO === "true";

export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  base: process.env.VITE_BASE_PATH ?? "/",
  build: {
    outDir: "../../dist-ui",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      // Shim node:fs/promises for browser builds (parseJsonLdDoc is pure,
      // only loadJsonLdGraph uses readFile — which is never called in static mode)
      ...(isStaticDemo
        ? {
            "node:fs/promises": resolve(__dirname, "src/adapters/static/fs-shim.ts"),
            // Swap api.ts for api-static.ts (in-memory backend)
            [resolve(__dirname, "src/ui/api.ts")]: resolve(__dirname, "src/ui/api-static.ts"),
          }
        : {}),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/rpm": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
