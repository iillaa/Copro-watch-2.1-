import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  assetsInclude: ['**/*.onnx', '**/*.wasm'],

  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],

  base: './',

  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // GROUPING: Combine all OCR-related dependencies into one stable chunk
          // This prevents circular dependencies between tesseract.js and its worker/core parts
          if (
            id.includes('tesseract') ||
            id.includes('onnxruntime-web') ||
            id.includes('@gutenye/ocr-browser') ||
            id.includes('@techstark/opencv-js')
          ) {
            return 'ocr-engine';
          }
          if (id.includes('UniversalOCRModal')) return 'ocr-feature';
        },
      },
    },
  },
});
