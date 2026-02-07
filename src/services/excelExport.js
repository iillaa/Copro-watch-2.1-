import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { db } from './db';
import { logic } from './logic';

// Helper: Convert ArrayBuffer to Base64 (For Android)
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const exportWorkersToExcel = async (workers, departments) => {
  try {
    console.log('[Excel] Starting Export...');

    // [FIX] Memory limit check - warn if dataset is too large
    const MEMORY_LIMIT = 2000; // Max workers before warning
    if (workers.length > MEMORY_LIMIT) {
      console.warn(
        `[Excel] Large dataset detected (${workers.length} workers). Export may be slow.`
      );
    }

    // 1. DATA PREPARATION
    let allExams = [];
    let waterLogs = [];
    let workplaces = [];
    let waterDepts = [];

    try {
      const [examsData, waterData, workplaceData, waterDeptData] = await Promise.all([
        db.getExams(),
        db.getWaterAnalyses(),
        db.getWorkplaces(),
        db.getWaterDepartments(),
      ]);
      allExams = examsData;
      waterLogs = waterData;
      workplaces = workplaceData;
      waterDepts = waterDeptData;
    } catch (e) {
      console.warn('[Excel] Partial data load:', e);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Copro-Watch v2.1';
    workbook.created = new Date();

    // ==========================================
    // 📊 SHEET 1: TABLEAU DE BORD
    // ==========================================
    const sheetDash = workbook.addWorksheet('Tableau de Bord', {
      views: [{ showGridLines: false }],
    });

    const totalWorkers = workers.length;

    // --- NEW PRIORITY LOGIC ---
    // 1. Inapte + Retard = "INAPTE (RETARD)" -> Count as Inapte AND Retard
    // 2. Apte + Retard = "En Retard" -> Count as Retard

    let stats = {
      apte: 0,
      aptePartiel: 0,
      inapte: 0,
      retard: 0,
      inapteRetard: 0, // Specific counter for the "Important" case
    };

    workers.forEach((w) => {
      const isLate = logic.isOverdue(w.next_exam_due);
      const stat = w.latest_status;

      if (stat === 'inapte') {
        stats.inapte++; // Always count as Inapte
        if (isLate) {
          stats.retard++;
          stats.inapteRetard++;
        }
      } else if (stat === 'apte_partielle') {
        stats.aptePartiel++;
        if (isLate) stats.retard++;
      } else if (stat === 'apte') {
        if (isLate) {
          stats.retard++; // Expired Apte becomes Retard
        } else {
          stats.apte++;
        }
      } else {
        // En attente / No status
        if (isLate) stats.retard++;
      }
    });

    // Water Stats
    const waterTotal = waterLogs.length;
    const waterPotable = waterLogs.filter((w) => w.result === 'potable').length;
    const waterCompliance = waterTotal > 0 ? waterPotable / waterTotal : 0;

    // --- DRAWING THE DASHBOARD ---

    // Title Block
    sheetDash.mergeCells('B2:E3');
    const titleCell = sheetDash.getCell('B2');
    titleCell.value = 'RAPPORT DE SANTÉ AU TRAVAIL';
    titleCell.font = { size: 20, bold: true, color: { argb: 'FFFFFFFF' } }; // White Text
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo Background

    // SECTION 1: SANTÉ
    sheetDash.getCell('B5').value = '🩺 STATISTIQUES MÉDICALES';
    sheetDash.getCell('B5').font = { size: 14, bold: true, color: { argb: 'FF374151' } };

    const medicalCards = [
      { label: 'EFFECTIF TOTAL', val: totalWorkers, color: '1F2937', bg: 'F3F4F6' },
      { label: 'APTES (ACTIFS)', val: stats.apte, color: '166534', bg: 'DCFCE7' },
      { label: 'APTES PARTIELS', val: stats.aptePartiel, color: '854D0E', bg: 'FEF9C3' },
      { label: 'INAPTES', val: stats.inapte, color: '991B1B', bg: 'FEE2E2' },
      { label: '⚠️ TOTAL RETARDS', val: stats.retard, color: 'FFFFFF', bg: 'EF4444' },
    ];

    // [NEW] Alert Row for "Inapte + Retard"
    if (stats.inapteRetard > 0) {
      medicalCards.push({
        label: '🚨 INAPTES NON REVOIS (GRAVE)',
        val: stats.inapteRetard,
        color: 'FFFFFF',
        bg: '7F1D1D', // Dark Red
      });
    }

    let row = 7;
    medicalCards.forEach((card) => {
      sheetDash.mergeCells(`B${row}:C${row}`); // Label Area

      const cellLabel = sheetDash.getCell(`B${row}`);
      cellLabel.value = card.label;
      cellLabel.font = { bold: true, color: { argb: 'FF' + card.color } };
      cellLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + card.bg } };
      cellLabel.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };

      const cellVal = sheetDash.getCell(`D${row}`);
      cellVal.value = card.val;
      cellVal.font = { size: 12, bold: true, color: { argb: 'FF' + card.color } };
      cellVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + card.bg } };
      cellVal.alignment = { horizontal: 'center' };
      cellVal.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };

      row++;
    });

    // SECTION 2: EAU
    row += 2;
    sheetDash.getCell(`B${row}`).value = "💧 QUALITÉ DE L'EAU";
    sheetDash.getCell(`B${row}`).font = { size: 14, bold: true, color: { argb: 'FF374151' } };
    row += 2;

    const waterCards = [
      { label: 'Analyses Totales', val: waterTotal },
      { label: '✅ Conformes', val: waterPotable },
      { label: '❌ Non Conformes', val: waterTotal - waterPotable },
      { label: 'Taux de Conformité', val: waterCompliance, fmt: '0.0%' },
    ];

    waterCards.forEach((card) => {
      sheetDash.mergeCells(`B${row}:C${row}`);
      const c1 = sheetDash.getCell(`B${row}`);
      c1.value = card.label;
      c1.font = { color: { argb: 'FF4B5563' } };
      c1.border = { bottom: { style: 'dotted', color: { argb: 'FFE5E7EB' } } };

      const c2 = sheetDash.getCell(`D${row}`);
      c2.value = card.val;
      if (card.fmt) c2.numFmt = card.fmt;
      c2.font = { bold: true };
      c2.alignment = { horizontal: 'center' };
      c2.border = { bottom: { style: 'dotted', color: { argb: 'FFE5E7EB' } } };
      row++;
    });

    sheetDash.getColumn(2).width = 30;
    sheetDash.getColumn(4).width = 15;

    // ==========================================
    // 👥 SHEET 2: TRAVAILLEURS
    // ==========================================
    const sheetWorkers = workbook.addWorksheet('Travailleurs', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheetWorkers.columns = [
      { header: 'Matricule', key: 'national_id', width: 15 },
      { header: 'Nom et Prénom', key: 'full_name', width: 30 },
      { header: 'Service', key: 'department_name', width: 25 },
      { header: 'Poste / Lieu', key: 'workplace_name', width: 25 },
      { header: 'Date Naissance', key: 'birth_date', width: 15 },
      { header: 'Dernier Examen', key: 'last_exam_date', width: 18 },
      { header: 'Prochain Dû', key: 'next_exam_due', width: 18 },
      { header: 'Statut Actuel', key: 'status', width: 25 }, // Wider for combined status
    ];

    const workerRows = workers.map((w) => {
      const dept = departments.find((d) => d.id == w.department_id);
      const wp = workplaces.find((loc) => loc.id == w.workplace_id);

      // --- NEW COMBINED STATUS LOGIC ---
      let statusLabel = '-';
      const stat = w.latest_status;
      const isLate = logic.isOverdue(w.next_exam_due);

      if (stat === 'inapte') {
        // Priority 1: Inapte is always visible
        statusLabel = isLate ? 'INAPTE (RETARD)' : 'Inapte';
      } else if (stat === 'apte_partielle') {
        statusLabel = isLate ? 'APTE PARTIEL (RETARD)' : 'Apte Partiel';
      } else if (stat === 'apte') {
        // If Apte but late, the Aptitude is expired -> En Retard
        statusLabel = isLate ? 'En Retard' : 'Apte';
      } else {
        statusLabel = isLate ? 'En Retard' : 'En attente';
      }

      return {
        national_id: w.national_id,
        full_name: w.full_name,
        department_name: dept ? dept.name : '-',
        workplace_name: wp ? wp.name : '-',
        birth_date: logic.formatDateDisplay(w.birth_date),
        last_exam_date: logic.formatDateDisplay(w.last_exam_date),
        next_exam_due: logic.formatDateDisplay(w.next_exam_due),
        status: statusLabel,
      };
    });

    sheetWorkers.addRows(workerRows);
    styleSheet(sheetWorkers);
    applyConditionalFormatting(sheetWorkers);

    // ==========================================
    // 🗂️ SHEET 3: HISTORIQUE (GROUPED)
    // ==========================================
    const sheetVisits = workbook.addWorksheet('Historique Médical', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheetVisits.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Type Visite', key: 'type', width: 20 },
      { header: 'Conclusion', key: 'conclusion', width: 20 },
      { header: 'Notes', key: 'notes', width: 40 },
    ];
    styleSheet(sheetVisits);

    const sortedWorkers = [...workers].sort((a, b) => a.full_name.localeCompare(b.full_name));

    sortedWorkers.forEach((worker) => {
      const myExams = allExams.filter((e) => e.worker_id == worker.id);
      if (myExams.length === 0) return;

      myExams.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));

      // GROUP HEADER
      const headerRow = sheetVisits.addRow([
        worker.full_name.toUpperCase() + ` (Mat: ${worker.national_id})`,
      ]);
      sheetVisits.mergeCells(`A${headerRow.number}:D${headerRow.number}`);
      headerRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6B7280' },
      };
      headerRow.getCell(1).alignment = { horizontal: 'left', indent: 1 };

      myExams.forEach((e) => {
        let conc = '-';
        if (e.decision && e.decision.status) conc = e.decision.status.toUpperCase();
        sheetVisits.addRow({
          date: logic.formatDateDisplay(e.exam_date),
          type:
            e.type === 'periodic' ? 'Périodique' : e.type === 'embauche' ? 'Embauche' : 'Spontanée',
          conclusion: conc,
          notes: e.comments || '-',
        });
      });
      sheetVisits.addRow([]);
    });

    // ==========================================
    // 🧪 SHEET 4: ANALYSES D'EAU (GROUPED BY SERVICE)
    // ==========================================
    if (waterLogs.length > 0) {
      const sheetWater = workbook.addWorksheet("Analyses d'Eau", {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      // COLUMNS (Removed Location Column because it's now a Group Header)
      sheetWater.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Résultat', key: 'result', width: 25 },
        { header: 'Décision', key: 'decision', width: 20 },
      ];
      styleSheet(sheetWater);

      // 1. PREPARE GROUPS
      const waterGroups = {};

      // Helper to find location name
      const getLocationName = (log) => {
        if (log.location) return log.location;
        // Try Structure
        if (log.structure_id) {
          const d = waterDepts.find((x) => x.id == log.structure_id);
          if (d) return d.name;
        }
        // Try Dept
        if (log.department_id) {
          const d = departments.find((x) => x.id == log.department_id);
          if (d) return d.name;
        }
        return 'LIEU INDÉFINI (Orphelin)';
      };

      waterLogs.forEach((log) => {
        const locName = getLocationName(log);
        if (!waterGroups[locName]) waterGroups[locName] = [];
        waterGroups[locName].push(log);
      });

      // 2. SORT GROUPS ALPHABETICALLY
      const sortedLocs = Object.keys(waterGroups).sort();

      // 3. RENDER GROUPS
      sortedLocs.forEach((loc) => {
        // GROUP HEADER
        const headerRow = sheetWater.addRow([loc.toUpperCase()]);
        sheetWater.mergeCells(`A${headerRow.number}:C${headerRow.number}`);
        headerRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0EA5E9' },
        }; // Sky Blue
        headerRow.getCell(1).alignment = { horizontal: 'left', indent: 1 };

        // ROWS
        const logs = waterGroups[loc];
        // Sort by Date Descending
        logs.sort((a, b) => {
          const dA = new Date(a.sample_date || a.request_date || 0);
          const dB = new Date(b.sample_date || b.request_date || 0);
          return dB - dA;
        });

        logs.forEach((l) => {
          let resLabel = '-';
          let decisionLabel = '-';
          let color = '000000';
          let bg = null;

          if (l.result === 'potable') {
            resLabel = '✅ CONFORME';
            decisionLabel = 'Potable';
            color = '166534'; // Green Text
          } else if (l.result === 'non_potable') {
            resLabel = '❌ NON CONFORME';
            decisionLabel = 'Non Potable';
            color = '991B1B'; // Red Text
            bg = 'FEE2E2'; // Red BG
          } else {
            resLabel = '⏳ EN COURS';
          }

          const row = sheetWater.addRow({
            date: logic.formatDateDisplay(l.sample_date || l.request_date),
            result: resLabel,
            decision: decisionLabel,
          });

          // Apply styles
          const cellRes = row.getCell('result');
          cellRes.font = { color: { argb: 'FF' + color }, bold: true };
          if (bg)
            cellRes.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
        });

        sheetWater.addRow([]); // Spacer
      });
    }

    // [SURGICAL REPLACEMENT START]
    const buffer = await workbook.xlsx.writeBuffer();

    // 1. Unique Filename with Time
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const filename = `CoproWatch_Excel_${dateStr}_${timeStr}.xlsx`;

    const { Capacitor } = await import('@capacitor/core');

    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      try {
        // Android 10+ doesn't always need requestPermissions for public Documents, but good to keep
        try {
          await Filesystem.requestPermissions();
        } catch (e) {}

        // 2. Define Export Folder
        const folder = 'copro-watch/Exports';

        // 3. Create folder if it doesn't exist (safe - won't overwrite existing)
        try {
          await Filesystem.mkdir({
            path: folder,
            directory: Directory.Documents,
            recursive: true,
          });
        } catch (e) {
          // Folder likely exists - that's fine, we can still write to it
          console.log('[Excel] Folder already exists or creation warning, attempting write...');
        }

        const base64Data = arrayBufferToBase64(buffer);

        // 4. Write File
        await Filesystem.writeFile({
          path: `${folder}/${filename}`,
          data: base64Data,
          directory: Directory.Documents,
        });

        alert(`✅ Excel sauvegardé :\nDocuments/${folder}/${filename}`);
      } catch (e) {
        console.error(e);
        throw new Error(
          "Impossible d'écrire dans Documents. Le dossier Documents/copro-watch existe peut-être déjà.\n\nEssayez de renommer ou déplacer ce dossier, puis réessayez."
        );
      }
    } else {
      // Web Fallback
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, filename);
    }
    // [SURGICAL REPLACEMENT END]
  } catch (error) {
    console.error('[Excel] Generation Error:', error);
    throw new Error('Erreur Export: ' + error.message);
  }
};

// --- STYLING HELPERS ---

function styleSheet(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  // Add borders to header
  headerRow.eachCell((cell) => {
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } } };
  });

  // Default Width
  if (sheet.columns) {
    sheet.columns.forEach((col) => {
      if (!col.width) col.width = 20;
    });
  }
}

function applyConditionalFormatting(sheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = row.getCell('status');
    const val = cell.value;

    if (val === 'Apte') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
      cell.font = { color: { argb: 'FF006100' } };
    } else if (val.includes('INAPTE') || val.includes('Retard')) {
      // RED for Inapte or Retard
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      cell.font = { color: { argb: 'FF9C0006' }, bold: true };
    } else if (val.includes('Partiel')) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
      cell.font = { color: { argb: 'FF9C5700' } };
    }
  });
}
