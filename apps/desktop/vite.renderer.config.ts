import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rendererDirectory = fileURLToPath(new URL('./src/renderer/', import.meta.url));
const rendererHtml = fileURLToPath(new URL('./src/renderer/index.html', import.meta.url));
const rendererOutputDirectory = fileURLToPath(new URL('./.vite/renderer/main_window/', import.meta.url));

export default defineConfig({
  root: rendererDirectory,
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: rendererOutputDirectory,
    rollupOptions: {
      input: rendererHtml,
    },
  },
});
