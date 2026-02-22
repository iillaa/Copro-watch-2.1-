const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.resolve(__dirname, '../public');
const capacitorAssetsDir = path.resolve(__dirname, '../capacitor-assets');

const filesToCopy = [
  // Tesseract OCR assets (minimal set)
  'tesseract/worker.min.js',
  'tesseract/tesseract-core.wasm.js',
  'tesseract/tesseract-core.wasm',
  'tesseract/fra.traineddata.gz',
  'tesseract/ara.traineddata.gz',
  'tesseract/eng.traineddata.gz',

  // PaddleOCR models
  'models/det.onnx',
  'models/rec_ara.onnx',
  'models/keys_ara.txt',

  // ONNX Runtime Web (ORT) assets - REQUIRED FOR PADDLE OCR
  'assets/ort-wasm-simd-threaded.asyncify.mjs',
  'assets/ort-wasm-simd-threaded.asyncify.wasm',
  'assets/ort-wasm-simd-threaded.jsep.mjs',
  'assets/ort-wasm-simd-threaded.jsep.wasm',
  'assets/ort-wasm-simd-threaded.jspi.mjs',
  'assets/ort-wasm-simd-threaded.jspi.wasm',
  'assets/ort-wasm-simd-threaded.mjs',
  'assets/ort-wasm-simd-threaded.wasm',
  'assets/ort-wasm-simd.wasm',
  'assets/ort-wasm.wasm',

  // General static assets
  'app-icon.svg',
  'manifest.json',
  'vite.svg',
];

async function prepareCapacitorAssets() {
  // 1. Clean the capacitor-assets directory
  console.log(`Cleaning ${capacitorAssetsDir}...`);
  if (fs.existsSync(capacitorAssetsDir)) {
    await fs.promises.rm(capacitorAssetsDir, { recursive: true, force: true });
  }
  await fs.promises.mkdir(capacitorAssetsDir, { recursive: true });

  // 2. Copy selected files
  console.log('Copying essential assets for Capacitor build...');
  for (const file of filesToCopy) {
    const sourcePath = path.join(publicDir, file);
    const destinationPath = path.join(capacitorAssetsDir, file);

    const destinationDir = path.dirname(destinationPath);
    if (!fs.existsSync(destinationDir)) {
      await fs.promises.mkdir(destinationDir, { recursive: true });
    }

    if (fs.existsSync(sourcePath)) {
      await fs.promises.copyFile(sourcePath, destinationPath);
      console.log(`  Copied: ${file}`);
    } else {
      console.warn(`  Warning: Source file not found, skipping: ${file}`);
    }
  }

  console.log('Capacitor assets prepared successfully.');
}

prepareCapacitorAssets().catch((error) => {
  console.error('Error preparing Capacitor assets:', error);
  process.exit(1);
});