import { defineConfig } from 'vite';
import { resolve } from 'path';

/** Bundles the Electron e2e harness (run via `pnpm test:e2e`). */
export default defineConfig({
  resolve: {
    alias: [{ find: /^\.\.\/database$/, replacement: resolve(__dirname, 'stub-database.ts') }],
  },
  build: {
    ssr: resolve(__dirname, 'capture-redaction.main.ts'),
    outDir: resolve(__dirname, '../out-e2e'),
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron'],
      output: { format: 'cjs', entryFileNames: 'main.cjs' },
    },
  },
});
