import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  // Use the optimized assets directory for Capacitor builds
  publicDir: 'capacitor-assets',

  assetsInclude: ['**/*.onnx', '**/*.wasm', '**/*.traineddata.gz'],

  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],

  base: './', // Ensures relative paths work correctly in Capacitor

  build: {
    outDir: 'dist-capacitor', // Output to a separate directory for Capacitor
    target: 'es2020',
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // GROUPING: Combine all OCR-related dependencies into one stable chunk
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