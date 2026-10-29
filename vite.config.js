import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rendererRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(rendererRoot, 'src/renderer'),
  plugins: [react(), tailwindcss()],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: path.join(rendererRoot, 'dist/renderer'), emptyOutDir: true },
  test: { environment: 'node', include: ['../core/**/*.test.js'] }
});
