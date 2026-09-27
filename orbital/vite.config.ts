import { defineConfig } from 'vite';

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
  },
});
