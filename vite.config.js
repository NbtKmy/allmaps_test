import { defineConfig } from 'vite'

export default defineConfig({
  // Emit relative asset URLs so dist/index.html works when opened from any
  // server root (VS Code Live Server serves the project root, not dist/).
  base: './',
  optimizeDeps: {
    // maplibre-gl v6 loads its worker via a URL relative to its own module.
    // Pre-bundling breaks that path (.vite/deps/maplibre-gl-worker.mjs is never emitted),
    // so serve maplibre-gl and its consumer straight from node_modules.
    exclude: ['maplibre-gl']
  }
})
