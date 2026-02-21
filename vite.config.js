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
    target: 'es2022',
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('onnxruntime-web')) return 'onnx-lib';
          if (id.includes('tesseract')) return 'tesseract-lib';
          if (id.includes('@gutenye/ocr-browser')) return 'paddle-lib';
          if (id.includes('@techstark/opencv-js')) return 'opencv-lib';
          if (id.includes('UniversalOCRModal')) return 'ocr-feature';
        },
      },
    },
  },
});
