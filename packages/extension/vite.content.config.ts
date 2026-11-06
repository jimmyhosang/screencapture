import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Content scripts are injected as classic scripts, not ES modules, so they
 * must not contain import/export statements. Build the content script on its
 * own as a self-contained IIFE (runs after the main build, which empties dist/).
 */
export default defineConfig({
  // Chrome rejects extension scripts containing Unicode noncharacters (rrweb
  // embeds a literal U+FFFE), so escape all non-ASCII output.
  esbuild: { charset: 'ascii' },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'ScreencaptureContent',
      fileName: () => 'content.js',
    },
    minify: 'esbuild',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@screencapture/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
