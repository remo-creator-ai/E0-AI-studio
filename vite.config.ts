import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/kling': {
            target: 'https://api.klingai.com',
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api\/kling/, ''),
            secure: true,
          },
        },
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        sourcemap: false,
        minify: 'terser' as const,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-media': ['jszip', 'html2canvas', 'react-easy-crop'],
              'vendor-ai': ['@google/genai'],
              'vendor-ui': ['lucide-react', 'zustand'],
            }
          }
        }
      }
    };
});
