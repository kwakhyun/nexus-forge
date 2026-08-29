import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/stream": {
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
      "/health": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["echarts"],
          monitoring: ["@sentry/react"],
        },
      },
    },
  },
});
