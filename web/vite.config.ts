import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

const backendTarget = process.env.MOCHAN_DEV_TARGET ?? "http://127.0.0.1:38421";
const wsTarget = backendTarget.replace(/^http/, "ws");

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: backendTarget, changeOrigin: true },
      '/ws':  { target: wsTarget, ws: true, changeOrigin: true },
      '/healthz': { target: backendTarget, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
