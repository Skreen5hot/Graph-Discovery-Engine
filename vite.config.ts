import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  base: process.env.VITE_BASE_PATH ?? "/",
  build: {
    outDir: "../../dist-ui",
    emptyOutDir: true,
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
