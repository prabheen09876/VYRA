import { defineConfig } from 'vite';
export default defineConfig({
  base: '/capture/',
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
