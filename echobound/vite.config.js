import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5199, strictPort: true, host: true },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
