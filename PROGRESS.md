# Development Progress Summary - February 22, 2026

## Work Completed:

### 1. OCR Functionality Enhancements & Fixes (Tesseract & PaddleOCR)
- **Tesseract OCR Stability:**
  - Resolved Tesseract OCR crashing and asset loading failures (404 errors) in Capacitor build by correcting asset path construction (`getAssetUrl`) and addressing double-slash issues.
  - Ensured true offline support for Tesseract by including all core WASM variants (`simd`, `lstm`, etc.) in the Capacitor asset preparation script, preventing CDN fallbacks.
  - Improved Tesseract error handling and logging with more verbose worker messages for better diagnostics, aiding in future debugging (e.g., when Tesseract was stuck at 0%).
- **PaddleOCR Functionality (Standalone PC):**
  - Addressed asset loading issues for PaddleOCR (ONNX Runtime) in the PC standalone version. This involved adjusting `vite.standalone.config.js` to set `base: '/'` and correcting `ort.env.wasm.wasmPaths` to `/assets/` in `UniversalOCRModal.jsx` to ensure proper root-relative pathing for assets served by `miniserve`.

### 2. PC Standalone Version Setup (miniserve)
- **Dynamic Asset Path Resolution:** Implemented a robust `getAssetUrl` function in `UniversalOCRModal.jsx` to correctly handle asset paths across different environments: Capacitor, `file://` protocol (for standalone HTML opened directly), and standard web servers (like `miniserve`).
- **Build Configuration:** Configured `vite.standalone.config.js` to externalize large OCR assets into subdirectories (preventing inline bloat) rather than inlining them into a single HTML file, preparing for the `miniserve` deployment.
- **Deployment Prep:** Executed build and copy steps to prepare the `coprowatch-usb` folder with the standalone build, ready for use with `miniserve`. Batch files (`1-Start-Portable.bat`, `2-Start-Node.bat`) were created.
- **Asset Copy to External Storage:** Copied the prepared `coprowatch-usb` folder to `/storage/emulated/0/Download/Dm/`.

### 3. Backup Functionality Clarification & Investigation (PC Standalone)
- **UI Clarification:** Updated the "Choisir Dossier" button label in `Settings.jsx` to "Choisir Dossier (Auto-Sauvegarde PC/Android)". This aims to guide PC standalone users to select a directory for persistent backups via the File System Access API.
- **Investigation:** Initial investigation into backup failures revealed that persistent backup/restore on web (including standalone PC) heavily relies on the user selecting a directory via the File System Access API. Issues on Windows 11 Firefox indicate browser-specific limitations or stricter security for this API.

### 4. General Improvements
- **Graceful Error Handling:** Removed the intrusive "FATAL CRASH" global error overlay in `index.html` to allow for more graceful error handling and better debugging experience; errors are now logged to the console instead of blocking the UI.

## Remaining/Outstanding Issues:

- **Tesseract Stuck at 0% (Capacitor Build):** Still awaiting updated logs from the Capacitor build after implementing verbose logging for Tesseract workers. This needs further diagnosis.
- **Backup on Windows 11 Firefox:** User reported "Choisir Dossier" did not work on Win11 Firefox with the previous version. Testing is needed with the latest build to see if the `miniserve` context helps, or if it's a browser limitation.
- **`server.exe` Placement:** User to manually place `server.exe` into the `coprowatch-usb` folder after copying.

## Next Steps:

1.  **User Testing:** User to test the latest `coprowatch-usb` build on PC (Windows 11 Firefox, etc.) to verify Paddle OCR and backup functionality.
2.  **Capacitor Tesseract Logs:** User to provide updated console logs from the Capacitor build to diagnose Tesseract getting stuck at 0%.
3.  **Further Debugging:** Based on user feedback, continue debugging any remaining OCR or backup issues.
