import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // relative base: the same build runs on the dev root AND the hub's
  // /games/orbital/ subpath without reconfiguration
  base: './',
  server: {
    port: 5185,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    // two shipped clients, one game: index.html = 2D (Pixi), three.html = 3D
    // (Three.js). Per-entry code splitting keeps each bundle engine-only.
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        three: resolve(rootDir, 'three.html'),
      },
    },
  },
});
