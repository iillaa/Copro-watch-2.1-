# 📈 Project Progress: Copro Watch v2.1

## ✅ Completed Enhancements

### 1. OCR Functionality (Tesseract & PaddleOCR)
- **Algerian Smart Dictionary:**
    - Created a massive standalone dictionary (`algerian_dictionary.json`) with 250+ entries covering common Algerian names and job roles in both French and Arabic.
    - Implemented **"Apply Defaults"** feature in the Help panel for one-click installation of the local knowledge base.
    - Optimized lookup logic to be space-immune and case-insensitive.
- **Tesseract OCR Stability:**
    - Resolved the "10% hang" issue by implementing robust asset detection (detects/rejects HTML redirect pages).
    - Enabled **Persistent Workers** (Reuse mode) to eliminate the 5-10s initialization delay between scans.
- **PaddleOCR Performance:**
    - Enabled engine persistence (**Model cached in RAM**) for near-instant cellular scans.
    - Fixed path resolution issues causing "protobuf parsing failed" errors on Android.
- **Hardware Acceleration:**
    - Refactored `getCellImage` to apply binarization filters via `ctx.filter` before drawing, leveraging GPU acceleration.

### 2. Backup & System Reliability
- **Hardened Security (v2.1):**
    - Implemented **"PIN + Pepper"** logic: Mixes the user's PIN with a secret hardcoded string to prevent brute-force attacks on 4-digit PINs.
    - **Mandatory JSON Encryption:** All backups (auto and manual) and JSON exports are now encrypted by default using AES-GCM (WebCrypto).
    - **Smart Decryption:** The app automatically attempts to decrypt backups using the current PIN hash; if it fails, it prompts the user for a password.
    - **Dual-Validation Migration:** Support for unlocking with old unpeppered hashes while facilitating migration to the new hardened format.
- **Emergency Background Backup:**
    - Resolved **"isTrusted: true"** error by implementing a 30s timeout and main-thread fallback for JSON stringification.
    - Added **Concurrent Export Locking** to prevent worker exhaustion during rapid app state changes.
    - Implemented **Data Change Detection**: Skips expensive disk writes if database content hasn't changed since the last backup.
- **System Initialization & Robustness:**
    - Fixed a race condition where the PIN would reset to `0000` on cold start; it now correctly loads from the database.
    - Refactored Lifecycle listener into a singleton to prevent duplicate background processes on Android.
    - Improved `importData` to handle empty strings and detect encrypted payloads automatically.

### 3. UI & UX Polish
- **Sidebar Optimization:**
    - Silenced React console warnings by refactoring margin shorthands into explicit properties.
    - Added touch swipe gestures for opening/closing the sidebar on tablet devices.
- **Modern Layout:**
    - Improved consistency between "Safe", "Turbo", and "Hybrid" OCR modes.

---

## 🛠️ Maintenance & Maintenance
- **LocalStorage Storage:** The Smart Dictionary is stored in `localStorage['ocr_smart_dict']`.
- **Offline Assets:** All OCR models and the dictionary are now bundled in `capacitor-assets/` for true offline mobile usage.
