# OCR Modal Analysis & Configuration Guide

This document outlines the current state, fixes, and configuration for the application's OCR (Optical Character Recognition) functionality, which uses both Tesseract.js and PaddleOCR.

---

## ✅ Current Status & Recent Improvements

1.  **Tesseract.js Asset Availability:** The issue of missing `fra.traineddata.gz` (and other language data) causing network errors has been resolved. Essential `.traineddata.gz` files (`fra`, `ara`, `eng`) are now present in the `public/tesseract/` directory.
2.  **Robust Error Handling:** The main OCR `handleGo` function in `src/components/UniversalOCRModal.jsx` now includes comprehensive `try-catch` blocks. This ensures that any errors during OCR processing (Tesseract, Paddle, or Hybrid) are gracefully caught, logged within the modal, and displayed to the user without crashing the entire application.
3.  **PaddleOCR Model Availability:** The PaddleOCR ONNX models (`det.onnx`, `rec_ara.onnx`, `keys_ara.txt`) are confirmed to be present in `public/models/`.
4.  **Capacitor Build Asset Optimization:** A new build process has been implemented to significantly reduce the APK size for Android Capacitor builds.

---

## 🚀 Capacitor Build Asset Optimization

To prevent redundant asset inclusion and minimize the final APK size, a dedicated asset preparation and build configuration is now in place for Capacitor.

### How it Works:

1.  **`scripts/prepare-capacitor-assets.js`**: This script acts as the single source of truth for all assets required for the Capacitor build. It includes:
    *   The minimal set of Tesseract.js core files (`worker.min.js`, `tesseract-core.wasm.js`, `tesseract-core.wasm`).
    *   All necessary Tesseract language data (`fra.traineddata.gz`, `ara.traineddata.gz`, `eng.traineddata.gz`).
    *   All PaddleOCR models (`det.onnx`, `rec_ara.onnx`, `keys_ara.txt`).
    *   Essential general static assets (e.g., `app-icon.svg`, `manifest.json`, `vite.svg`).
    This script cleans the `capacitor-assets/` directory and copies only these specified files into it.
2.  **`vite.capacitor.config.js`**: This specialized Vite configuration file is used for Capacitor builds. It sets its `publicDir` to `capacitor-assets/` and outputs the build to `dist-capacitor/`.
3.  **`package.json` Script**: The `build:capacitor` script in `package.json` now orchestrates this process:
    ```bash
    "build:capacitor": "node scripts/prepare-capacitor-assets.js && vite build --config vite.capacitor.config.js"
    ```

### Using the Optimized Build:

When building for Capacitor (e.g., for Android APK), you should now use:

```bash
npm run build:capacitor
```

Capacitor should then be configured to synchronize its assets from the `dist-capacitor/` directory.

---

## 🛠️ General OCR Configuration Notes

*   **Asset Paths**: The `getAssetUrl()` helper in `src/components/UniversalOCRModal.jsx` automatically resolves asset paths relative to the root (`/tesseract/`, `/models/`). The Vite build configurations ensure that these paths correctly point to the appropriate files based on the build target (development, web, standalone, or Capacitor).
*   **Tesseract.js Languages**: The application is configured to load 'fra' (French) and 'ara' (Arabic) language data for Tesseract.js. The `UniversalOCRModal.jsx` intelligently switches between these or loads both as 'ara+fra' depending on the `docLanguage` state.
*   **PaddleOCR Models**: The PaddleOCR engine uses `det.onnx`, `rec_ara.onnx`, and `keys_ara.txt` for Arabic recognition.

---

## 📝 CODE IMPROVEMENTS & REMINDERS

*   **`UniversalOCRModal.jsx`**:
    *   The `handleImageChange` function should include robust `onerror` handling for image loading.
    *   PaddleOCR engine (`ocr` instance) should always be disposed of in a `finally` block to prevent memory leaks (`if (ocr && ocr.dispose) await ocr.dispose();`). This is implemented in `runPaddleOCR` and `runHybridOCR`.
    *   Ensure `filterWordsByGrid` includes validation for empty or null `words` arrays.

---

## ❓ FAQ & Troubleshooting

*   **Large APK Size**: If your APK size is unexpectedly large, ensure you are using `npm run build:capacitor` for your Android builds and that Capacitor is configured to use the `dist-capacitor/` output.
*   **OCR Engine Initialization Errors**: If Tesseract or PaddleOCR fails to initialize, check the browser console/modal logs for specific error messages. For Tesseract, ensure `traineddata.gz` files are correctly present in `public/tesseract/`. For PaddleOCR, verify `.onnx` and `.txt` models in `public/models/`. If you suspect the `capacitor-assets/` folder is not correctly populated, check `scripts/prepare-capacitor-assets.js`.
