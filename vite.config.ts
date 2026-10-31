import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_TARGET=artifact builds the single-page version published on claude.ai
// (see scripts/build-artifact.mjs); otherwise the full app served by server/.
const artifact = process.env.VITE_TARGET === 'artifact';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: artifact
    ? {
      outDir: '../dist-artifact',
      emptyOutDir: true,
      copyPublicDir: false,
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
      // One classic (non-module) script: the most widely supported way to run inline.
      rollupOptions: { output: { inlineDynamicImports: true, format: 'iife' } },
    }
    : { outDir: '../dist', emptyOutDir: true, sourcemap: false },
  server: { proxy: { '/api': 'http://localhost:3000', '/healthz': 'http://localhost:3000' } },
});
