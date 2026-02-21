import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

// [FIX] We remove topLevelAwait because it often causes silent hangs in Android WebViews.
// es2020 handles the necessary logic natively without the extra plugin wrapper.

export default defineConfig({
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
  plugins: [
    react(), 
    wasm()
  ],
  
  // [CRITICAL FIX] Capacitor requires an absolute base path ('/') to resolve 
  // dynamic chunks correctly. './' causes 404 errors for JS files in APKs.
  base: '/', 

  build: {
    // [FIX] target es2020 is the most stable for modern Android WebViews.
    // 'esnext' can produce code that older WebViews cannot parse.
    target: 'es2020', 
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@techstark/opencv-js')) return 'opencv-lib';
          if (id.includes('UniversalOCRModal')) return 'ocr-feature';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});