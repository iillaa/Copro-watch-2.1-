### Language Correction

**Original:** "Make detailed codemap"
**Correction:** "Make **a** detailed code map." or "Create **a** detailed code map."
**Explanation:** Added the article "a" for grammatical correctness.

---

### 🗺️ Project Code Map: Copro-Watch

Here is the detailed `CODEMAP.md` file. Save this in your project root. It covers every major file and its responsibility, which will help keep our context aligned in future conversations.

```markdown
# 🗺️ Copro-Watch Project Code Map

> **Version:** 2.1.0
> **Purpose:** Offline-first Medical Fleet Management (SPA)
> **Stack:** React 19, Vite, Capacitor 8, Dexie (IndexedDB)

## 🏗️ Core Architecture

- **Offline-First:** No backend. All data lives in `IndexedDB` via `Dexie.js`.
- **Security:** Dual-layer security. Client-side AES-GCM encryption for exports using a dedicated **Backup Password**. App is PIN-locked with secure local hashing (fixed pepper).
- **Persistence:** "Fail-Safe" backup system (Auto + Manual) saving to `Documents/copro-watch` on Android. All JSON backups are encrypted by default.
- **UI Design:** Neobrutalism (High contrast, thick borders, flat colors).

---

## 📂 Directory Structure & Responsibilities

### 🔧 Configuration (Root)

| File                            | Responsibility                                                              |
| :------------------------------ | :-------------------------------------------------------------------------- |
| `package.json`                  | Dependencies (React, Capacitor, Date-fns, Dexie, React-Icons). Also defines build scripts. |
| `vite.config.js`                | Standard web build configuration for development and `npm run build`.       |
| `vite.standalone.config.js`     | **Special Build:** Compiles app into a single `.html` file (portable mode). |
| `vite.capacitor.config.js`      | **New Build:** Optimized build configuration specifically for Capacitor (Android/iOS) to reduce APK size. |
| `capacitor.config.json`         | Android native settings (App ID: `com.coprowatch.app`).                     |
| `scripts/prepare-capacitor-assets.js` | **Automation Script:** Prepares the `capacitor-assets/` directory with only the essential files for Capacitor builds. |
| `TECHNICAL_ARCHITECTURE.md`     | Security protocols and backup logic documentation.                          |
| `ANDROID_BUILD_INSTRUCTIONS.md` | Guide for generating the APK.                                               |

### 📂 Directory Structure & Responsibilities (Continued)

#### 📦 Build Outputs & Assets

| Directory/File                  | Responsibility                                                              |
| :------------------------------ | :-------------------------------------------------------------------------- |
| `public/`                       | Contains all static assets (images, OCR engine files, traineddata, models) for development and standard web builds. |
| `capacitor-assets/`             | **New:** Contains only the minimal set of static assets (Tesseract essentials, traineddata, PaddleOCR models, core static files) required for an optimized Capacitor build. This directory is populated by `scripts/prepare-capacitor-assets.js`. |
| `dist/`                         | Output directory for standard web builds (`npm run build`).                 |
| `dist-standalone/`              | Output directory for the single-file HTML build (`npm run build:standalone`). |
| `dist-capacitor/`               | **New:** Output directory for Capacitor-optimized web builds (`npm run build:capacitor`). This output is intended for packaging into Android/iOS applications. |

#### ⚙️ Scripts

| Directory/File                  | Responsibility                                                              |
| :------------------------------ | :-------------------------------------------------------------------------- |
| `scripts/prepare-capacitor-assets.js` | Automatically prepares the `capacitor-assets/` directory with the minimal set of files for Capacitor builds. |

### 🧠 Logic Layer (`src/services/`)

This is the brain of the application.

- **`db.js`** (The Database)

  - **Wrapper:** `Dexie`.
  - **Tables:** `workers`, `departments`, `workplaces`, `exams`, `water_analyses`, `water_departments`, `weapon_holders`, `weapon_exams`.
  - **Security:** Decoupled from PIN logic. Implements **Mandatory JSON Encryption** for all exports using the Backup Password.
  - **Triggers:** Calls `backup.registerChange()` on every save/delete.

- **`backup.js`** (The Safety Net)

  - **Auto-Backup:** Tracks a "dirty counter". Triggers export after **10 changes**.
  - **Smart Import:** Detects encryption and automatically decrypts backups using the stored Backup Password.
  - **Android:** Uses `Capacitor Filesystem` to write directly to `Documents/copro-watch`.

- **`crypto.js`** (The Vault)

  - **Algorithm:** AES-GCM (256-bit).
  - **Mechanism:** Standalone Backup Password (8+ characters) derived directly via PBKDF2.
  - **PIN Hashing:** Simple, secure local hashing using a fixed internal pepper for UI access control.
  - **Usage:** Encrypts exports (`.json`) so they can be safely transported.

- **`logic.js`** (The Doctor)


  - **Rules:**
    - Standard Exam Interval: **6 Months**.
    - Retest Interval (Positive Case): **7 Days**.
    - Weapon Review Interval: **12 Months** (or per commission).
  - **Calculations:** Determines `next_exam_due` and `status` (Apte, Inapte).
  - **Stats:** Generates dashboard counters (Overdue, Due Soon, Weapon Aptitude).

- **`excelExport.js`** (Data Export)

  - Generates `.xlsx` files with multiple sheets (Workers, Exams, Water History).

- **`pdfGenerator.js`** (Document Engine)
  - Generates PDF certificates, summons, water analysis requests, and attendance sheets.

### 🎨 UI Components (`src/components/`)

#### 🔐 Core & Layout

- **`App.jsx`**: Main Router. Manages `PinLock` state and Sidebar navigation.
- **`PinLock.jsx`**: 4-digit security overlay. Blocks access until correct PIN (Default: `0011` or DB setting) is entered.
- **`ErrorBoundary.jsx`**: Prevents white screen of death if a component crashes.
- **`Toast.jsx`**: Global notification system for success/error messages.
- **`Settings.jsx`**:
  - Manage PIN.
  - Backup Controls (Export, Import, Threshold).
  - **CRUD:** Manage Departments (RH) and Workplaces.
- **`MoveWorkersModal.jsx`**: Modal for moving workers between departments.

#### 📊 Dashboard & Workers

- **`Dashboard.jsx`**: High-level stats.
  - Shows: "Visites à faire (15j)", "Cas Positifs", "Retards".
  - Graphs: Simple visual indicators.
- **`WorkerList.jsx`**: The main employee table.
  - Features: Search, Filter by Dept, Status Badges (Green/Red/Yellow).
- **`WorkerDetail.jsx`**: The patient folder.
  - Shows: Personal info, Exam history timeline.
  - Actions: "Nouvel Examen", "Imprimer Certificat".
- **`AddWorkerForm.jsx`**: Modal to create/edit a worker.
- **`ExamForm.jsx`**: The medical visit form.
  - Inputs: Date, Weight, Result (Pos/Neg), Treatment, Decision.
- **`BulkActionsToolbar.jsx`**: Floating toolbar for multi-select operations.
- **`BatchScheduleModal.jsx`**: Modal to schedule multiple exams.
- **`BatchPrintModal.jsx`**: Modal for batch PDF generation.
- **`BatchResultModal.jsx`**: Modal for entering results for multiple workers.

#### 💧 Water Analysis Module

- **`WaterAnalyses.jsx`**: Main container for the Water module.
- **`WaterAnalysisPanel.jsx`**: Quick input for daily checks (Chlorine, pH, Temperature).
- **`WaterAnalysesOverview.jsx`**: Summary table of all water points.
- **`WaterAnalysesHistory.jsx`**: Log of past water tests.
- **`WaterAnalysisForm.jsx`**: Detailed form for a specific water test.
- **`WaterServiceDetail.jsx`**: Specific view for a single water department.

#### 🛡️ Weapon Management Module (`src/components/Weapons/`)

_Note : Ce module a été initialement forké du module de gestion des travailleurs (`src/components/WorkerList.jsx`, etc.), partageant des structures et des logiques similaires. Cela peut être une opportunité pour une future refactorisation afin de maximiser la réutilisation du code et maintenir la cohérence._

- **`WeaponDashboard.jsx`**: Stats for weapon aptitude (Apte, Inapte, Revoir).
- **`WeaponList.jsx`**: Table of weapon holders with permit details.
- **`WeaponDetail.jsx`**: Folder for a weapon holder with commission history.
- **`AddWeaponHolderForm.jsx`**: Form for creating/editing weapon holders (includes Photo).
- **`WeaponExamForm.jsx`**: Medical commission form (Visual acuity, Psych check).

#### 📸 OCR Module (`src/components/UniversalOCRModal.jsx`)

- **`UniversalOCRModal.jsx`**: Main component for OCR functionality. Utilizes `Tesseract.js` and `@gutenye/ocr-browser` (PaddleOCR) for intelligent document scanning. Features robust error handling and optimized asset management for Capacitor builds.

### 💅 Styles (`src/`)

- **`index.css`**: The design system.
  - **Variables:** `--primary`, `--surface`, `--border-color`.
  - **Theme:** Neobrutalism (Hard shadows, outlines).
  - **Fixes:** Contains the critical "Universal Pinlock" & Mobile Landscape overrides.

### 📱 Android Native (`android/`)

- `AndroidManifest.xml`: Requests `MANAGE_EXTERNAL_STORAGE` permission (Critical for backup persistence).

## 🔄 Critical Data Flows

1.  **Saving an Exam:**
    `ExamForm` -> `db.saveExam()` -> `IndexedDB` -> `backup.registerChange()` -> (if counter > 10) -> `backup.performAutoExport()`.
2.  **App Launch:**
    `App.jsx` -> `db.init()` (Migrate if needed) -> `backup.checkAndAutoImport()` (Load fresh data) -> `PinLock` (Block UI).
```
