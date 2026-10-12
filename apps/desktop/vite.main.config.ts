import { defineConfig } from 'vite';

const allowedOrigins = (process.env.LILTWISE_ALLOWED_WEB_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export default defineConfig({
  define: {
    __LILTWISE_ALLOWED_WEB_ORIGINS__: JSON.stringify(allowedOrigins),
  },
  build: {
    rollupOptions: {
      external: ['electron'],
    },
  },
});
