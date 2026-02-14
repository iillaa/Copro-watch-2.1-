# 🤖 AI PROMPT (START HERE)

**ROLE:** Senior React Architect.
**TASK:** Update the "Weapons Module" to V4 specifications.
**FOCUS:** UI spacing, Form fields, and Business Logic adjustments.

---

# 🛠️ SPECIFICATION V4: Final Adjustments

## 1. 📋 WeaponList.jsx (Grid & Layout)

The "Prochain Dû" column is too narrow. The other columns have short text and can be shrunk.

### A. Update Grid Template

- **Current:** `'... 1.5fr 0.8fr 1fr 0.9fr 2.2fr ...'`
- **NEW Template:** `'50px 1.8fr 0.6fr 0.8fr 0.8fr 3fr 100px'`
  - _Explanation:_
    - Checkbox: 50px
    - Nom: 1.8fr (More space).
    - Matricule: 0.6fr (Shrink).
    - Service: 0.8fr (Shrink).
    - Poste: 0.8fr (Shrink).
    - **Prochain Dû: 3fr** (Maximize space).
    - Actions: 100px

## 2. ➕ AddWeaponHolderForm.jsx (Fields)

Refine the input fields for creating a new agent.

### A. Field Changes

- ❌ **REMOVE:** `birth_date`.
- ✅ **ADD:** `phone` (Label: "Téléphone").
- ✅ **ADD:** `medical_history` (Label: "Antécédents Médicaux" - Text Area).
- **DEFAULT STATUS:** Set `status` to `'pending'` (or `null`), **NOT** `'apte'`.
  - _Logic:_ A new agent is "Neutre" until their first Commission.

## 3. 👤 WeaponDetail.jsx (History Table)

**CRITICAL:** This component must be a **STRICT VISUAL CLONE** of `WorkerDetail.jsx`.
Do not invent new styles. Copy the structure/shadows/padding exactly.

### A. The Grid Columns (History Section)

- **Template:** Use the same "Hybrid Row" style as WorkerDetail.
- **Columns to Show:**
  1.  **Date Commission** (Main date).
  2.  **Type** (was Motif).
  3.  **Décision Finale** (The Badge: Apte/Inapte).
  4.  **Prochaine Révision** (Calculated date).
- **Columns to HIDE:**
  - Do NOT show "Avis Psychologue" in the row.
  - Do NOT show "Avis Chef de Service" in the row.
  - Do NOT show "Avis Médecin" in the row.
  - _(Note: These details remain in the database, just hidden from the list view)._

## 4. 📝 WeaponExamForm.jsx (The Commission Logic)

This is the core logic change.

### A. Form Fields

1.  **Date de Commission:** (Date Input). Default to Today. _Basis for calculations._
2.  **Type (was Motif):** Select Dropdown.
    - _Options:_ "Affection Somatique", "Affection Psychiatrique", "Affection Psychologique", "Par Précaution".
3.  ❌ **Remove:** `visual_acuity` (OD/OG).
4.  ✅ **Add:** `medical_aptitude` (Radio/Select: "Apte" or "Inapte"). _Label: "Mon Avis (Médecin)"._
5.  **Avis Psychologue:** Keep dropdown.
6.  **Avis Chef de Service:** Keep dropdown. _Label: "Avis Chef de Service (Responsable Direct)"._

### B. "Decision Finale" Logic

- **If Decision == 'Apte':**
  - `next_review_date` = `null` (Permanent).
  - _Note:_ "Apte" is valid indefinitely until a new incident occurs.
- **If Decision == 'Inapte Temporaire':**
  - `next_review_date` = `commission_date` + `duration` (months).

## 5. 📊 WeaponDashboard.jsx (Logic Update)

- **"À Revoir" (Due Soon):** Must include agents where:
  - `status` === `'pending'` (New agents / Neutre).
  - `status` === `'inapte'` AND `next_review_date` is close/passed.
- **"Apte":** Agents with status 'apte' (Count them, but don't flag them as due).

## 6. Execution Instructions

1.  Apply Grid changes to `WeaponList.jsx`.
2.  Update fields in `AddWeaponHolderForm.jsx` and `WeaponExamForm.jsx`.
3.  Refactor `WeaponDetail.jsx` to match the style of `WorkerDetail.jsx` (strictly).
4.  Ensure `db.saveWeaponExam` handles the new date logic (Permanent Apte).
