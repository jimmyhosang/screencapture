import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import * as fs from 'fs';

// Plugin to copy static files and fix paths after build
function copyExtensionFiles() {
  return {
    name: 'copy-extension-files',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');

      // Copy manifest.json
      fs.copyFileSync(
        resolve(__dirname, 'public/manifest.json'),
        resolve(distDir, 'manifest.json')
      );

      // Copy icons
      const iconsDir = resolve(distDir, 'icons');
      if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
      }
      for (const size of [16, 32, 48, 128]) {
        fs.copyFileSync(
          resolve(__dirname, `public/icons/icon${size}.png`),
          resolve(iconsDir, `icon${size}.png`)
        );
      }

      // Move popup HTML to root and fix paths
      const popupSrc = resolve(distDir, 'src/popup/index.html');
      if (fs.existsSync(popupSrc)) {
        let html = fs.readFileSync(popupSrc, 'utf-8');
        // Fix asset paths
        html = html.replace(/\/assets\//g, './assets/');
        html = html.replace(/src="\.\/main\.tsx"/g, '');
        fs.writeFileSync(resolve(distDir, 'popup.html'), html);
        // Clean up
        fs.rmSync(resolve(distDir, 'src'), { recursive: true, force: true });
      }

      console.log('Extension files copied to dist/');
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
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
