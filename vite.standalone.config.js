import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  // Use 'public' as the source for static assets
  publicDir: 'public', 

  // [FIX] Added assetsInclude to ensure ONNX models are recognized
  assetsInclude: ['**/*.onnx', '**/*.wasm', '**/*.traineddata.gz'],
  
  // [FIX] Added the full plugin suite needed for OCR
  plugins: [
    react(), 
    wasm(), 
    topLevelAwait(), 
    // IMPORTANT: viteSingleFile() must be removed for miniserve setup
    // as we need assets to be external and in subdirectories.
  ],
  
  // [CRITICAL FIX] Set base to './' so the file works when opened from a local disk
  base: './', 

  build: {
    outDir: 'dist-standalone', // Ensure output goes to dist-standalone
    target: 'esnext',
    // [FIX] Setting inline limit to 0 to prevent inlining of assets,
    // as they need to be served as external files by miniserve.
    assetsInlineLimit: 0, 
    // Chunk size warnings are less relevant when externalizing all assets
    chunkSizeWarningLimit: 10000, 
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // inlineDynamicImports: true, // Not needed if viteSingleFile is removed
        // Ensure assets are placed in subdirectories
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});