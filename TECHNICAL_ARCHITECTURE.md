# Technical Architecture & Security Model

## 1. System Overview

**Copro-Watch** is an offline-first Single Page Application (SPA) designed for medical fleet management in low-connectivity environments.

- **Stack:** React 19, Vite, Capacitor 8.
- **Persistence:** Dexie.js (IndexedDB wrapper).
- **Runtime:** Web Browser (Standalone HTML) or Android Webview.
- **Core Module Reusability**: Several modules, notably the 'Weapon Management' module, were initially forked from the 'Worker Management' module, sharing significant UI and business logic patterns. This highlights a strategy of code reuse that could lead to further abstraction and refactoring opportunities.
- **OCR Subsystem**: Integrates Tesseract.js and PaddleOCR for document scanning. Recent improvements include resolution of Tesseract asset loading issues and robust error handling to prevent application crashes.

## 2. Security Architecture

Copro-Watch implements client-side cryptographic security to ensure data privacy without a backend.

### 2.1 Encryption Strategy

Data export and sensitive operations utilize the **Web Crypto API** for standardized, hardware-accelerated encryption.

- **Algorithm:** AES-GCM (256-bit).
- **Key Derivation:** PBKDF2 (250,000 iterations, SHA-256).
- **Hardened Key Stretching (v2.1):** To protect low-entropy (4-digit) PINs against brute-force attacks, the system concatenates the user PIN with a hardcoded **Internal Pepper** string (`PIN + PEPPER`) before derivation. This ensures that even a 10,000-combination PIN has high-entropy protection.
- **Implementation:** `src/services/crypto.js`
  - **Salt/IV:** Randomly generated (`crypto.getRandomValues`) for every encryption operation.
  - **Transport:** Encrypted payloads are Base64 encoded for safe JSON transport.
  - **Mandatory JSON Encryption:** As of v2.1, ALL JSON backups and exports (auto or manual) are encrypted by default using the current app PIN hash + Pepper.

### 2.2 Access Control & Security

- **Hardened PIN System:** PINs are stored as SHA-256 hashes of the `PIN + Pepper`. 
- **Migration Path:** The app supports "Dual-Validation" during the transition period, allowing users to unlock with old hashes while prompting them to re-save their PIN to upgrade to the hardened format.
- **Auto-Lock Protocol:** Application automatically locks after 5 minutes of inactivity (no mouse/keyboard events).
- **Implementation:** `src/components/PinLock.jsx` (UI) and `src/App.jsx` (Timer/Migration Logic).

### 2.3 Cryptography Fallback

- **Primary:** WebCrypto API (AES-GCM / SHA-256).
- **Fallback:** Custom bitwise XOR/Hash implementation for legacy WebViews.
  - **Security Note:** Uses a hardcoded salt (`CoproWatch-v2...`) to prevent rainbow table attacks, though less secure than SHA-256. Intended for crash prevention on Android < 7.

## 3. Data Integrity & Automated Backups

The system implements a **Fail-Safe** backup strategy to prevent data loss in offline scenarios.

### 3.1 The "Smart Backup" Engine

Logic resides in `src/services/backup.js`.

1.  **Change Tracking:** Every database write (Worker, Exam, Water Analysis) increments a dirty counter.
2.  **Automated Trigger:** When `counter >= threshold` (Default: 10), `triggerBackupCheck()` initiates an auto-export.
3.  **Dual-File System:**
    - `backup-auto.json`: System-generated, frequent snapshots.
    - `backup-manuel.json`: User-initiated, permanent snapshots.
4.  **Conflict Resolution:** During import (`readBackupJSON`), the system compares timestamps of both files and loads the most recent one automatically, preventing stale data overwrites.

### 3.2 Backup Service Logic

- **Debounce:** Writes are registered with a 500ms debounce to prevent freezing the UI during rapid typing.
- **Race Condition Handling:** Service waits up to 5 seconds for DB initialization before failing.
- **Storage Strategy:**
  - **Android:** Uses `Capacitor Filesystem` (Documents/copro-watch).
  - **Web:** Uses `window.showDirectoryPicker` API (Chromium) or Blob Download fallback.

## 4. Export Engines

### 4.1 Excel Export Engine

- **Implementation:** `src/services/excelExport.js`
- **Library:** `xlsx` (SheetJS)
- **Features:**
  - Multi-sheet workbook generation
  - Workers sheet with all details
  - Exams history sheet
  - Water analyses history sheet
  - Formatted headers and timestamps

### 4.2 PDF Generator Engine

- **Implementation:** `src/services/pdfGenerator.js`
- **Library:** `jspdf` with `jspdf-autotable`
- **Documents Generated:**
  - Medical fitness certificates (Aptitude/Inaptitude) for hygiene
  - Weapon aptitude certificates (Commission Médicale)
  - Exam summons/convocations
  - Water analysis requests
  - Attendance sheets for batch operations

## 5. CI/CD & DevOps

The project utilizes automated pipelines for consistent build delivery via GitHub Actions.

- **Workflow:** `.github/workflows/android-build.yml`.
- **Automation:**
  1.  Sets up Node 22 & Java 21 environment.
  2.  **Prepares Capacitor assets** using `scripts/prepare-capacitor-assets.js`.
  3.  **Compiles React assets** using the Capacitor-optimized build (`npm run build:capacitor`).
  4.  Syncs Capacitor native bridge.
  5.  Builds Android Release APK (`assembleRelease`).
  6.  **Signs APK:** Automated `apksigner` injection using GitHub Secrets.

## 6. Asset Management & Optimization

To minimize the final APK size for Android Capacitor builds, a selective asset packaging strategy is employed:

- **`capacitor-assets/` Directory:** This dedicated folder contains only the absolutely essential Tesseract.js runtime files, trained language data, PaddleOCR models, and core static assets required for the Capacitor environment.
- **`scripts/prepare-capacitor-assets.js`:** An automated script is responsible for populating `capacitor-assets/` from the main `public/` directory, ensuring consistency and preventing manual errors.
- **`vite.capacitor.config.js`:** A custom Vite configuration file leverages `capacitor-assets/` as its `publicDir`, directing the build output (`dist-capacitor/`) to contain only the optimized subset of assets.

This ensures that the Android APK includes only the necessary OCR components and general assets, leading to a significantly smaller application footprint.

## 7. Android Specifics & Permissions

- **Target:** Enterprise Sideloading (Non-Play Store Distribution).
- **FileSystem Strategy:** Direct access to `Documents/copro-watch` for user-accessible backups.
- **Manifest:** Uses `MANAGE_EXTERNAL_STORAGE` to ensure data persistence survives app uninstalls—critical for medical records on shared devices.

## 8. Database Schema

### 8.1 Core Tables (Updated v3 Schema)

| Table                | Fields                                                      | Indexes                     |
| :------------------- | :---------------------------------------------------------- | :-------------------------- |
| `workers`            | id, full_name, national_id, department_id, archived         | archived, department_id     |
| `departments`        | id, name                                                    | name                        |
| `workplaces`         | id, name, certificate_text                                  | name                        |
| `exams`              | id, worker_id, exam_date                                    | worker_id, exam_date        |
| `water_departments`  | id, name                                                    | name                        |
| `water_analyses`     | id, sample_date, department_id, structure_id                | department_id, structure_id |
| `weapon_holders`     | id, full_name, national_id, department_id, status, archived | archived, department_id     |
| `weapon_exams`       | id, holder_id, exam_date, visit_reason, final_decision      | holder_id, exam_date        |
| `weapon_departments` | id, name                                                    | name                        |

### 8.2 Settings Table

- **Key:** `app_settings`
- **Fields:** pin, backupThreshold, encryptionEnabled

## 9. Project Structure Verification

For automated analysis tools:

| Component     | Path                           | Status |
| :------------ | :----------------------------- | :----- |
| Security Core | `src/services/crypto.js`       | EXISTS |
| Backup Core   | `src/services/backup.js`       | EXISTS |
| Auth Core     | `src/components/PinLock.jsx`   | EXISTS |
| Excel Export  | `src/services/excelExport.js`  | EXISTS |
| PDF Generator | `src/services/pdfGenerator.js` | EXISTS |
| CI/CD         | `.github/workflows`            | EXISTS |

## 10. Build Variants

| Variant    | Command                                      | Output                                   | Purpose                                               |
| :--------- | :------------------------------------------- | :--------------------------------------- | :---------------------------------------------------- |
| Web        | `npm run build`                              | `dist/`                                  | Standard web deployment                               |
| Standalone | `npm run build:standalone`                   | `dist-standalone/index.html`             | Single portable HTML file                             |
| Capacitor  | `npm run build:capacitor` (orchestrates script + vite build) | `dist-capacitor/`                        | Optimized web assets for Android/iOS APKs (reduced size) |
| Android    | `./gradlew assembleRelease` (from `android/`) | `android/app/build/outputs/apk/release/` | Final signed APK for Android devices                  |
