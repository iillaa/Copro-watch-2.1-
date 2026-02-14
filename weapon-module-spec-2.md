# TASK: Weapon Module V2 (Refinement & Parity)

## 1. Objective

Refine the previously scaffolded "Weapons" module to match the feature set of the "Copro" module.
**Key Focus:** Tablet optimization, Data Isolation ("Silos"), and Missing "Batch" features.

## 2. Database Schema Updates (`src/services/db.js`)

We need to handle "Services" (Departments) specifically for Weapons, isolated from Hygiene departments.

**Update `version(3).stores`:**

1.  **`weapon_departments`**: `++id, name` (New Store for "Service RH").
2.  **`weapon_holders`**: Modify schema to:
    - `++id, full_name, national_id, department_id, job_function, status, next_review_date, archived`
    - _Removed:_ `photo`, `permit_type` (No longer needed).
    - _Added:_ `department_id` (Link to weapon_departments).

**Update Methods:**

- Add `getWeaponDepartments()`, `saveWeaponDepartment()`, `deleteWeaponDepartment()`.
- Update `exportData()` function to include `weapon_departments`, `weapon_holders`, and `weapon_exams` in the JSON backup.

## 3. Component Refinement (`src/components/Weapons/`)

### A. `AddWeaponHolderForm.jsx` (Renamed Concept: "Nouveau Agent")

- **Fields to REMOVE:**
  - ❌ `photo` (Delete input and logic).
  - ❌ `permit_type` (Delete input).
  - ❌ `workplace` (Delete input).
- **Fields to ADD/KEEP:**
  - ✅ `department_id` (Dropdown: Load from `db.getWeaponDepartments`).
  - ✅ `job_function` (Keep this! Label: "Poste / Grade").
  - ✅ `full_name`, `national_id`, `birth_date`.
- **Terminology:** Title should be **"Ajouter un Agent"** (not Déteneur).

### B. `WeaponList.jsx` (Feature Parity)

- **Filter Panel:**
  - Add "Filtrer par Service" (Dropdown populated by `weapon_departments`).
  - Add "Filtrer par Statut" (Apte / Inapte).
- **Batch Actions (The "Selection Mode"):**
  - Add Checkboxes to the left of each row.
  - When rows are selected, show a **Floating Toolbar** (like Copro) with:
    - "🖨️ Imprimer Liste" (Simple list print).
    - "🗑️ Supprimer" (Bulk delete).
- **Export:**
  - Add an "Excel Export" button in the header (uses `services/excelExport.js`).

### C. `WeaponDetail.jsx` (Tablet Mode)

- **Header:**
  - Remove `photo` display.
  - **Archive Action:** Replace the text link "Archiver" with a **Big Red Icon Button** (FaArchive) suitable for Tablet touch.
- **Tabs/Sections:**
  - **Tab 1: Historique Médical** (The list of exams - Existing).
  - **Tab 2: Documents** (New): A section to view/regenerate PDF certificates from previous exams.

### D. `WeaponDashboard.jsx`

- **Stats:** Ensure "Inapte" count is accurate.
- **Shortcuts:** Add a quick button to "Gérer les Services" (Simple modal to add/remove `weapon_departments`).

## 4. Shared Services Updates

### `src/services/excelExport.js`

- Add a new function `exportWeaponsToExcel(agents, departments)`:
  - Columns: Nom, Matricule, Service, Poste, Statut, Date Prochaine Visite.

### `src/services/backup.js`

- Ensure the "Auto-Backup" trigger fires when `saveWeaponHolder` or `saveWeaponExam` is called.

## 5. Execution Rules (Safety)

- **Do NOT break Copro:** When updating `excelExport.js`, simply _add_ a new function. Do not modify the existing `exportWorkersToExcel`.
- **Code Style:** Use the existing "Batch" UI components (Modals/Toolbars) if possible, or duplicate them into `src/components/Weapons/` if they are too tightly coupled to Copro.
- **Tablet UX:** Increase padding on buttons in the Weapon module.
