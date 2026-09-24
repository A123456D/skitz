import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: true,
    // WRECKBALL's dedicated dev port — sibling sessions in this workspace run
    // their own Vite servers (5173, 5175...); strictPort refuses to serve the
    // wrong project rather than silently drifting to the next free port
    port: 5180,
    strictPort: true,
    // sibling projects in this workspace get built by parallel sessions —
    // watching them churned the dev server with constant full reloads
    watch: {
      ignored: ['**/sis-website/**', '**/desync/**', '**/motherroot/**', '**/tmp-skilltest/**', '**/crucible/**', '**/feral/**', '**/context/**', '**/rite-shots/**', '**/ascent/**'],
    },
  },
  test: {
    // this is the WRECKBALL suite; motherroot/ is a separate project with its
    // own test script — don't glob its in-flux tests from this workspace root
    exclude: ['**/node_modules/**', 'motherroot/**', 'tmp-skilltest/**', 'sis-website/**', 'ascent/**', 'crucible/**', 'feral/**'],
  },
});
