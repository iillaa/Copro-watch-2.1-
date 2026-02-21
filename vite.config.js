import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
  plugins: [react(), wasm(), topLevelAwait()],
  base: './',
  server: {
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 3000, // Prevents terminal spam
    rollupOptions: {
      output: {
        // [STRATEGY] Surgical code splitting for OCR/AI heavy libraries
        manualChunks(id) {
          // If the code belongs to OpenCV, put it in 'opencv-lib'
          if (id.includes('@techstark/opencv-js')) {
            return 'opencv-lib';
          }
          // If the code belongs to the OCR Modal, put it in 'ocr-feature'
          if (id.includes('UniversalOCRModal')) {
            return 'ocr-feature';
          }
          // Put all other heavy node_modules in 'vendor.js'
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
