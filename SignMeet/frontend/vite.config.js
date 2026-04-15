import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const BACKEND_HTTP_URL = process.env.VITE_BACKEND_HTTP_URL || 'http://backend:8000';
const BACKEND_WS_URL = BACKEND_HTTP_URL.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/get_token': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://backend:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
