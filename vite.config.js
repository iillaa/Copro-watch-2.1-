import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

// [FIX] We remove topLevelAwait because it often causes silent hangs in Android WebViews.
// es2022 handles the necessary logic natively without the extra plugin wrapper.

export default defineConfig({
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
  plugins: [
    react(), 
    wasm()
  ],
  
  // [CRITICAL FIX] Capacitor requires an absolute base path ('/') to resolve 
  // dynamic chunks correctly. './' will cause a blank screen in APKs.
  base: '/', 

  server: {
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  build: {
    // [FIX] target es2020 is the most stable for modern Android WebViews.
    target: 'es2020', 
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // [STRATEGY] We keep the chunks but use a simpler naming convention
        manualChunks(id) {
          if (id.includes('@techstark/opencv-js')) return 'opencv-lib';
          if (id.includes('UniversalOCRModal')) return 'ocr-feature';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});