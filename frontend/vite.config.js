import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Preserves the `@/...` imports used throughout the app (was a craco webpack alias).
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // `@/App` and `@/components/...` are imported without extensions.
    extensions: [".mjs", ".js", ".jsx", ".json"],
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    // Keep CRA's output directory so existing deploy configs keep working.
    outDir: "build",
    sourcemap: false,
  },
});
