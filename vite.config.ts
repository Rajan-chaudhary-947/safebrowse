import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, 'popup.html'),
        dashboard: resolve(rootDir, 'dashboard.html'),
        blocked: resolve(rootDir, 'blocked.html'),
        background: resolve(rootDir, 'src/background/serviceWorker.ts')
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background/serviceWorker.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
