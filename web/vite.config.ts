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
  build: {
    // The largest vendor chunk (CodeMirror with all language packs) sits at
    // ~670 KB but only loads when FileManager opens, and is cacheable across
    // releases. Lift the warning threshold so this intentional split doesn't
    // get flagged.
    chunkSizeWarningLimit: 700,
    // Hoist heavy third-party deps into stable vendor chunks. The initial
    // `index` chunk (shell + router) shrinks; large per-app chunks like
    // FileManager (CodeMirror) and Terminal (xterm) also drop because their
    // dependencies are now shared.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@codemirror') || id.includes('@uiw/react-codemirror') || id.includes('codemirror')) {
            return 'vendor-codemirror';
          }
          if (id.includes('@xterm')) {
            return 'vendor-xterm';
          }
          if (id.includes('@radix-ui')) {
            return 'vendor-radix';
          }
          if (id.includes('framer-motion')) {
            return 'vendor-framer';
          }
          if (id.includes('lucide-react')) {
            return 'vendor-lucide';
          }
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
});
