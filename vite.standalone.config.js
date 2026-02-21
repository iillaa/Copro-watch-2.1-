import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  // [FIX] Added assetsInclude to ensure ONNX models are recognized
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
  
  // [FIX] Added the full plugin suite needed for OCR
  plugins: [
    react(), 
    wasm(), 
    topLevelAwait(), 
    viteSingleFile()
  ],
  
  // [CRITICAL FIX] Set base to './' so the file works when opened from a local disk
  base: './', 

  build: {
    target: 'esnext',
    // [FIX] High limit is mandatory to inline the 24MB WASM and 10MB OpenCV
    assetsInlineLimit: 100000000, 
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true, // Required for single-file mode
      },
    },
  },
});