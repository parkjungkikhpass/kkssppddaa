import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // 431 오류 해결: 헤더 크기 제한 확장 (대용량 이미지 Base64 전송용)
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        // HMR 최적화 설정 - 대용량 Base64 상태 처리 개선
        hmr: {
          // HMR 연결 안정화
          timeout: 60000,
          // WebSocket 메시지 크기 제한 증가 (기본값보다 큼)
          // 대용량 상태 변화 시에도 연결 유지
          overlay: true,
        },
        // 워치 설정 최적화 - 불필요한 리빌드 방지
        watch: {
          // node_modules 변경 무시 (성능 향상)
          ignored: ['**/node_modules/**', '**/.git/**'],
        },
      },
      // 개발 서버 HTTP 옵션 오버라이드 (Node.js 레벨)
      optimizeDeps: {
        // 큰 패키지 사전 번들링
        include: ['@google/genai'],
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // 번들 최적화 설정
      build: {
        rollupOptions: {
          output: {
            // 벤더 청크 분리로 캐싱 효율 향상
            manualChunks: {
              // React 관련 라이브러리
              'vendor-react': ['react', 'react-dom'],
              // Google AI 관련 라이브러리 (큰 사이즈)
              'vendor-google': ['@google/genai'],
              // 유틸리티 라이브러리
              'vendor-utils': ['jszip', 'file-saver'],
            }
          }
        },
        // 청크 사이즈 경고 한도 설정
        chunkSizeWarningLimit: 500,
        // 빠른 minify (esbuild 사용)
        minify: 'esbuild',
        // 모던 브라우저 타겟
        target: 'es2020'
      }
    };
});
