import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  // Use the optimized assets directory for Capacitor builds
  publicDir: 'capacitor-assets',

  // [CRITICAL] Prevent Vite from hashing or processing these files.
  // They must be served from the root as static files for OCR engines to find them.
  assetsInclude: ['**/*.onnx'], 

  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],

  base: './', 

  build: {
    outDir: 'dist-capacitor',
    target: 'es2020',
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
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