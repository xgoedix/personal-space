import { defineConfig } from "vite";
import { randomUUID } from "node:crypto";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const release = process.env.BICHO_RELEASE_SHA || randomUUID();

// In development, /api is proxied to `wrangler pages dev` (port 8788), which runs the
// real Pages Function and reaches the agent Worker through its service binding.
export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: "bicho-release",
    transformIndexHtml: () => [{ tag: "meta", attrs: { name: "bicho-release", content: release }, injectTo: "head" }],
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "release.json", source: JSON.stringify({ version: release }) });
    },
  }],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8788", changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
