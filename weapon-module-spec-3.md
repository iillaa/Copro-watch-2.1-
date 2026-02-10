# 🤖 AI PROMPT (START HERE)
**ROLE:** You are a Senior React Architect.
**TASK:** Finalize the "Weapon Aptitude" module by aligning it perfectly with the existing "Copro" module standards.
**CONTEXT:** The basic structure exists, but the UI is inconsistent, and key "Manager" features are missing.
**INSTRUCTION:** Read the specifications below and implement the changes. **DO NOT** delete `WorkerList.jsx` or `WorkerDetail.jsx`; use them as your source of truth for styling.

---

# 🛠️ TECHNICAL SPECIFICATION: Weapon Module V3 (Final Polish)

## 1. ⚙️ Settings & Departments (Move from Dashboard)
The user wants to manage "Services RH" (Weapon Departments) inside the global **Settings** page, not the Dashboard.

### A. Update `src/components/Settings.jsx`
* **Add a new Section/Tab:** "Services (Armes)".
* **Functionality:**
    * List existing departments from `weapon_departments` store.
    * Add new department (Simple input + "Ajouter" button).
    * Delete department (Trash icon).
    * *Note:* Allow this section to share the screen with the existing "Services (Hygiène)".

### B. Update `AddWeaponHolderForm.jsx`
* Ensure the "Service RH" dropdown pulls strictly from `db.getWeaponDepartments()`.
* Add a small link/button "Gérer" next to the dropdown that opens `Settings` (or a modal) if the list is empty.

## 2. 📋 WeaponList.jsx (Parity & Features)
The current list is missing header buttons and specific columns.

### A. Header Actions (Top Right)
Add the missing buttons to match `WorkerList.jsx`:
1.  **Backup (JSON):** `handleExport` function.
2.  **Import (JSON):** `handleImport` input.
3.  **Excel:** Already exists, keep it.

### B. Grid Columns
* **Rename Column:** Change header "Révision" to **"Prochain Dû"**.
* **Data Display:** Ensure it shows the `next_review_date` formatted correctly.

### C. Batch Toolbar (The "Small Panel")
When multiple agents are selected, show the `BulkActionsToolbar`. You must implement the handlers for:
1.  **📅 Nouvelle Visite (BatchSchedule):**
    * Opens `BatchScheduleModal`.
    * On Confirm: Create `weapon_exams` for all selected agents with status 'pending' (En attente).
2.  **⚖️ Décision Groupée (BatchResult):**
    * Opens `BatchResultModal` (adapted for Weapons).
    * On Confirm: Update the last exam to 'Apte' or 'Inapte' and recalculate `next_review_date` for all selected.
3.  **🖨️ Imprimer (Convocations):**
    * Opens `BatchPrintModal`.
    * **RESTRICTION:** The only options allowed are:
        * "Liste Convocation par Service"
        * "Convocation Individuelle"
    * *Remove:* "Certificat" or "Demande" from this batch view.

## 3. 👤 WeaponDetail.jsx (Strict Styling)
The current detail view looks different from the "Copro" worker detail.
**Requirement:** strictly CLONE `src/components/WorkerDetail.jsx`.

### Implementation Steps:
1.  **Copy** the entire content of `WorkerDetail.jsx`.
2.  **Paste** it into `WeaponDetail.jsx`.
3.  **Refactor Variables:**
    * Change `worker` -> `holder`.
    * Change `exams` -> `weapon_exams`.
    * Change `db.getWorker` -> `db.getWeaponHolder`.
4.  **Preserve the Layout:**
    * Keep the **Top Card** style (Name, Badge, Grid of info).
    * Keep the **Tab System** (Historique / Documents).
    * Keep the **Hybrid Table** for the exam history.
5.  **Adapt Fields:**
    * Instead of "Poste de travail" (Location), show "Service RH".
    * Instead of "Analyses", show "Visites Médicales".

## 4. 📄 PDF Generation (`src/services/pdfGenerator.js`)
Update the service to handle the Weapon specific batch prints.

### Add Case: `weapon_convocation_list`
* **Layout:** Grouped by Service.
* **Columns:** Matricule, Nom, Grade, "Émargement".
* **Title:** "CONVOCATION VISITE MÉDICALE (PORT D'ARME)".

### Add Case: `weapon_convocation_individual`
* **Layout:** One page per agent (or 4 per page).
* **Text:** "M. [Nom] est convoqué pour sa visite d'aptitude au port d'arme le [Date]."

## 5. 🚀 Execution Order
1.  Modify `Settings.jsx` (Service Manager).
2.  Refactor `WeaponDetail.jsx` (Style Clone).
3.  Update `WeaponList.jsx` (Buttons & Batch Logic).
4.  Update `pdfGenerator.js`.