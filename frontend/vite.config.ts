import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  optimizeDeps: {
    // MapLibre GL's web worker fails to bundle correctly under Vite's
    // esbuild-based dependency pre-bundling — exclude it so the worker
    // loads as MapLibre ships it. See maplibre-gl-js v5->v6 migration guide.
    exclude: ['maplibre-gl', '@tomtom-org/maps-sdk'],
  },
})
