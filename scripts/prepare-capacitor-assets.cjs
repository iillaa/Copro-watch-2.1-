const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const publicDir = path.resolve(__dirname, '../public');
const capacitorAssetsDir = path.resolve(__dirname, '../capacitor-assets');

const filesToCopy = [
  'tesseract/tesseract.min.js',
  'tesseract/worker.min.js',
  'tesseract/tesseract-core.wasm.js',
  'tesseract/tesseract-core.wasm',
  'tesseract/tesseract-core-simd.wasm.js',
  'tesseract/tesseract-core-simd.wasm',
  'tesseract/tesseract-core-lstm.wasm.js',
  'tesseract/tesseract-core-lstm.wasm',
  'tesseract/tesseract-core-simd-lstm.wasm.js',
  'tesseract/tesseract-core-simd-lstm.wasm',
  'tesseract/tesseract-core-relaxedsimd.wasm.js',
  'tesseract/tesseract-core-relaxedsimd.wasm',
  'tesseract/tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract/tesseract-core-relaxedsimd-lstm.wasm',
  'tesseract/fra.traineddata.gz',
  'tesseract/ara.traineddata.gz',
  'tesseract/eng.traineddata.gz',
  'models/det.onnx',
  'models/rec_ara.onnx',
  'models/keys_ara.txt',
  'assets/ort-wasm-simd-threaded.asyncify.mjs',
  'assets/ort-wasm-simd-threaded.asyncify.wasm',
  'assets/ort-wasm-simd-threaded.jsep.mjs',
  'assets/ort-wasm-simd-threaded.jsep.wasm',
  'assets/ort-wasm-simd-threaded.jspi.mjs',
  'assets/ort-wasm-simd-threaded.jspi.wasm',
  'assets/ort-wasm-simd-threaded.mjs',
  'assets/ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd.wasm',
  'ort-wasm.wasm',
  'app-icon.svg',
  'manifest.json',
  'vite.svg',
];

async function prepareCapacitorAssets() {
  console.log(`Cleaning ${capacitorAssetsDir}...`);
  if (fs.existsSync(capacitorAssetsDir)) {
    await fs.promises.rm(capacitorAssetsDir, { recursive: true, force: true });
  }
  await fs.promises.mkdir(capacitorAssetsDir, { recursive: true });

  console.log('Processing assets for Capacitor build...');
  for (const file of filesToCopy) {
    const sourcePath = path.join(publicDir, file);
    const destinationPath = path.join(capacitorAssetsDir, file);
    const destinationDir = path.dirname(destinationPath);

    if (!fs.existsSync(destinationDir)) {
      await fs.promises.mkdir(destinationDir, { recursive: true });
    }

    if (!fs.existsSync(sourcePath)) {
      console.warn(`  Warning: Source file not found: ${file}`);
      continue;
    }

    if (file.endsWith('.traineddata.gz')) {
      const decompressedPath = destinationPath.replace('.gz', '');
      console.log(`  Decompressing: ${file}`);
      const compressedData = fs.readFileSync(sourcePath);
      const decompressedData = zlib.gunzipSync(compressedData);
      fs.writeFileSync(decompressedPath, decompressedData);
    } else if (file.endsWith('.js')) {
      // AGGRESSIVE PATCHING: Remove all CDN links from ALL javascript files
      console.log(`  Patching JS file: ${file}`);
      let content = fs.readFileSync(sourcePath, 'utf8');
      
      // Replace various CDN patterns with local paths
      const localTess = '/tesseract/';
      content = content.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@v[0-9.]+\/dist\//g, localTess);
      content = content.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js-core@v[0-9.]+\//g, localTess);
      content = content.replace(/https:\/\/unpkg\.com\/tesseract\.js@v[0-9.]+\/dist\//g, localTess);
      
      fs.writeFileSync(destinationPath, content);
    } else {
      await fs.promises.copyFile(sourcePath, destinationPath);
      console.log(`  Copied: ${file}`);
    }
  }

  console.log('Capacitor assets prepared with Universal Offline Patches.');
}

prepareCapacitorAssets().catch((error) => {
  console.error('Error preparing Capacitor assets:', error);
  process.exit(1);
});
