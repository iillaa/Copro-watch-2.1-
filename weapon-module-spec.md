# TASK: Create "Gestion Armes" Module (Weapon Aptitude)

## 0. 🛑 SAFETY PROTOCOL (STRICT)

- **DO NOT DELETE** any existing files.
- **DO NOT MODIFY** `WorkerList.jsx`, `Dashboard.jsx`, or `WaterAnalyses.jsx`.
- **ISOLATION:** All new UI components MUST be created in a new folder: `src/components/Weapons/`.
- **APPROVAL:** If you believe you must modify an existing file (other than adding the store to `db.js` or the route to `App.jsx`), **STOP**. Do not write the code. Instead, output a block titled `[PROPOSED CHANGE]` explaining why, so the Architect can review it.

## 1. Architecture Strategy

- **Clone & Adapt:** We want the "Weapons" module to look and feel exactly like the "Copro" module.
  - `WeaponDashboard.jsx` should be a modified clone of `Dashboard.jsx`.
  - `WeaponList.jsx` should be a modified clone of `WorkerList.jsx`.
- **Decoupling:** Do not try to reuse the existing components. Copy the code into the new files and rename variables (e.g., `workers` -> `weaponHolders`). This prevents bugs in the old module.

## 2. Database Schema (Update `src/services/db.js`)

- **Action:** Add a new version (version 3) to the Dexie database.
- **New Stores:**
  1.  `weapon_holders`: `++id, full_name, national_id, status, next_review_date, archived`
  2.  `weapon_exams`: `++id, holder_id, exam_date, visit_reason, final_decision`
- **New Methods:** Add `getWeaponHolders`, `saveWeaponHolder`, `getWeaponExams`, `saveWeaponExam`.

## 3. The New Components (`src/components/Weapons/`)

### A. `WeaponDashboard.jsx` (The Command Center)

- **Source:** Clone logic from `Dashboard.jsx`.
- **Stats to Calculate:**
  - 🟢 **Apte** (Active weapon holders).
  - 🔴 **Inapte** (Weapon withdrawn).
  - 🟠 **A Revoir** (Inaptitude period ending within 30 days).
- **UI:** 3 Big Cards (like Copro) + "Latest Activity" list.

### B. `WeaponList.jsx` (The Roster)

- **Source:** Clone structure from `WorkerList.jsx`.
- **Columns:** Photo | Name/ID | Job Function | Permit Type | Status (Badge) | Action.
- **Status Badges:**
  - "Apte" (Green)
  - "Inapte Temporaire" (Red)
  - "Inapte Définitif" (Black)
- **Actions:** Edit, Delete, **"Nouvelle Visite"** (Link to Exam).

### C. `AddWeaponHolderForm.jsx`

- **Source:** Clone `AddWorkerForm.jsx`.
- **Fields:**
  - Name, Matricule (ID), Birth Date.
  - **Permit Type:** [Port d'Arme | Détention | Chasse].
  - **Job Function:** [Agent de Sécurité | Convoyeur | Particulier].
  - Photo Upload.

### D. `WeaponExamForm.jsx` (The Medical Commission)

- **Concept:** This replaces the generic `ExamForm`.
- **Workflow:**
  1.  **Context:** Reason for visit (Recruitment, Annual, Return from Sick Leave).
  2.  **Medical Check:** Visual Acuity (Right/Left 1-10), General Obs.
  3.  **Psych Check:** Simple "Avis Psychologue" (Favorable/Reserved).
  4.  **Commission Decision:** [Apte] or [Inapte].
  5.  **Duration:** If Inapte, for how long? (1, 3, 6, 12 months).
- **Logic:** Saving this form updates the `weapon_holder`'s status and `next_review_date` automatically.

## 4. Navigation (Update `src/App.jsx`)

- **Action:** Create a "Launcher" view or add "Armes" to the Sidebar.
- **Route:** `view === 'weapons'` loads the `WeaponDashboard`.
