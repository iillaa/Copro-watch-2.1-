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
- **Architectural Security Split (v2.1.1):**
    - **PIN/Password Separation:** Decoupled Application Access (4-digit PIN) from Data Encryption (8+ character Backup Password) to eliminate key derivation mismatches.
    - **Independent Login:** The app now uses a fixed internal pepper for PIN hashing, ensuring that changing backup settings never locks the user out of the app.
    - **Dedicated Backup Password:** Introduced a mandatory 8-character minimum password for all data exports and auto-backups, stored locally for a seamless "Zero-Prompt" experience.
    - **Enhanced Privacy:** The Backup Password is now hidden (`type="password"`) in the settings menu.
    - **Split Settings UI:** Separated PIN updates from Profile/Backup updates with dedicated save buttons to prevent logic collisions.
- **Hardened Security (v2.1):**
    - Implemented **"PIN + Pepper"** logic: Mixes the user's PIN with a secret hardcoded string to prevent brute-force attacks on 4-digit PINs. (Note: Refined in v2.1.1 to fixed internal pepper).
    - **Mandatory JSON Encryption:** All backups (auto and manual) and JSON exports are now encrypted by default using AES-GCM (WebCrypto).
    - **Smart Decryption:** The app automatically attempts to decrypt backups using the current stored Backup Password; if it fails (e.g., file from another device), it prompts the user.
- **Emergency Background Backup:**
    - Resolved **"isTrusted: true"** error by implementing a 30s timeout and main-thread fallback for JSON stringification.
    - Added **Concurrent Export Locking** to prevent worker exhaustion during rapid app state changes.
    - Implemented **Data Change Detection**: Skips expensive disk writes if database content hasn't changed since the last backup.
- **Database Integrity & Maintenance:**
    - **Restored Orphan Cleanup:** Fully operational `cleanupOrphans` function that purges ghost records across Medical, Water, and Weapon modules.
    - **Auto-Status Updates:** Verified that saving exams correctly triggers "Fit/Unfit" status recalculations for both workers and weapon holders.
    - **System Initialization:** Refactored Lifecycle listener into a singleton to prevent duplicate background processes on Android.

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
