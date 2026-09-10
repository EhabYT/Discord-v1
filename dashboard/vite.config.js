import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'static',
  build: {
    outDir: 'public',
    emptyOutDir: true,
    // Keep the initial JS small and long-term cacheable: React + Socket.IO
    // change far less often than dashboard pages, so splitting them into a
    // stable vendor chunk means repeat visits revalidate only the app chunk.
    // `es2020` avoids transpiling modern syntax for legacy browsers we do not
    // support, which shrinks helpers in every chunk.
    target: 'es2020',
    cssMinify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) requires the function form: stable vendor chunk
        // means repeat visits revalidate only the app chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) return 'vendor';
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/socket.io-parser') || id.includes('node_modules/engine.io-client')) return 'realtime';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/setup': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/setup': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true }
    }
  }
});
