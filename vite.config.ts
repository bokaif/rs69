import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Server config only for development
  ...(mode === 'development' && {
    server: {
      host: '127.0.0.1',
      port: 5173,
      headers: {
        'Cross-Origin-Embedder-Policy': 'unsafe-none'
      }
    }
  })
}));
