import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      server: {
        port: 3456,
        strictPort: true,
        host: '0.0.0.0',
        // '/api/kling' dev 프록시를 제거했다. Kling 호출은 ai-proxy Edge Function 을
        // 경유하므로 dev 서버가 중계할 필요가 없다. 오히려 이 프록시에 의존하던
        // 기존 구조는 프로덕션 빌드에서 동작하지 않았다.
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
