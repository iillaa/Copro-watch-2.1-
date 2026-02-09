import { jsPDF } from 'jspdf';
import { logic } from './logic';
import { db } from './db';

// [FIX] Proper dynamic import handling for Capacitor
let Filesystem, Directory;
let Capacitor = { isNativePlatform: () => false };
let capacitorReady = false;

async function initCapacitor() {
  if (capacitorReady) return;
  try {
    const capModule = await import('@capacitor/core');
    Capacitor = capModule.Capacitor;
    const fsModule = await import('@capacitor/filesystem');
    Filesystem = fsModule.Filesystem;
    Directory = fsModule.Directory;
    capacitorReady = true;
  } catch (e) {
    console.warn('[PDF] Capacitor not available:', e);
    capacitorReady = true;
  }
}

if (typeof window !== 'undefined') {
  initCapacitor();
}

const MARGIN = 20;

export const pdfService = {
  generateBatchDoc: async (workers, docType, options = {}) => {
    // 1. Determine Orientation
    const isLandscape = docType === 'copro' || docType === 'convocation';
    const orientation = isLandscape ? 'l' : 'p';
    const doc = new jsPDF(orientation, 'mm', 'a4');

    // Fetch workplaces for custom certificate text
    const workplaceMap = new Map();
    if (docType === 'aptitude') {
      try {
        const allWorkplaces = await db.getWorkplaces();
        allWorkplaces.forEach((wp) => {
          if (wp.name && wp.certificate_text) {
            workplaceMap.set(wp.name.toLowerCase().trim(), wp.certificate_text);
          }
        });
      } catch (e) {
        console.error('Failed to load workplaces', e);
      }
    }

    if (docType === 'list_manager') {
      generateGroupedList(doc, workers, options);
    } else if (docType === 'weapon_aptitude') {
      // WEAPON APTITUDE (Portrait)
      workers.forEach((agent, index) => {
        if (index > 0) doc.addPage();
        drawWeaponAptitude(doc, agent, options);
      });
    } else if (docType === 'aptitude') {
      // APTITUDE (Portrait 2/page)
      for (let i = 0; i < workers.length; i++) {
        if (i > 0 && i % 2 === 0) doc.addPage();
        const yOffset = i % 2 === 0 ? 0 : 148.5;
        drawAptitudeCertificate(doc, workers[i], options, yOffset, workplaceMap);

        if (i % 2 === 0 && i < workers.length - 1) {
          doc.setLineDash([2, 2], 0);
          doc.setDrawColor(150);
          doc.line(10, 148.5, 200, 148.5);
          doc.setDrawColor(0);
          doc.setLineDash([]);
        }
      }
    } else if (docType === 'copro' || docType === 'convocation') {
      // PAYSAGE (2 par page)
      for (let i = 0; i < workers.length; i++) {
        if (i > 0 && i % 2 === 0) doc.addPage();

        const xOffset = i % 2 === 0 ? 0 : 148.5;

        if (docType === 'copro') {
          drawCoproRequest(doc, workers[i], options, xOffset);
        } else {
          drawConvocation(doc, workers[i], options, xOffset);
        }

        if (i % 2 === 0 && i < workers.length - 1) {
          doc.setLineDash([2, 2], 0);
          doc.setDrawColor(150);
          doc.line(148.5, 10, 148.5, 200);
          doc.setDrawColor(0);
          doc.setLineDash([]);
        }
      }
    } else {
      workers.forEach((worker, index) => {
        if (index > 0) doc.addPage();
        doc.text('Document inconnu', MARGIN, 50);
      });
    }

    // [SURGICAL REPLACEMENT START]
    // 1. Generate unique filename with Date AND Time (HH-MM-SS) to prevent overwriting
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // 14:30:00 -> 14-30-00
    const fileName = `CoproWatch_${docType}_${dateStr}_${timeStr}.pdf`;

    await initCapacitor();

    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = doc.output('datauristring').split(',')[1];

        // 2. Define specific Export folder
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
          console.log('[PDF] Folder already exists or creation warning, attempting write...');
        }

        // 4. Save file to the specific folder
        await Filesystem.writeFile({
          path: `${folder}/${fileName}`,
          data: base64Data,
          directory: Directory.Documents,
        });

        alert(`✅ PDF sauvegardé :\nDocuments/${folder}/${fileName}`);
      } catch (e) {
        console.error(e);
        alert(
          '❌ Erreur de sauvegarde. Le dossier Documents/copro-watch existe peut-être déjà.\n\nEssayez de renommer ou déplacer ce dossier, puis réessayez.'
        );
      }
    } else {
      // Web fallback
      doc.save(fileName);
    }
    // [SURGICAL REPLACEMENT END]
  },
};

// ==========================================
// 1. CONVOCATION INDIVIDUELLE (PAYSAGE)
// ==========================================
function drawConvocation(doc, worker, options, xOffset) {
  const centerX = xOffset + 74.25;
  const leftMargin = xOffset + 10;
  const y = (val) => val;

  // HEADER OFFICIEL
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');

  doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, y(15), { align: 'center' });

  doc.setFontSize(8);
  doc.text("MINISTERE DE L'INTERIEUR ET", leftMargin, y(22));
  doc.text('DE TRANSPORT', leftMargin, y(26));
  doc.text('DIRECTION GENERALE', leftMargin, y(30));
  doc.text('DE LA SURETE NATIONALE', leftMargin, y(34));
  doc.text("SURETE DE WILAYA D'IN-SALAH", leftMargin, y(38));
  doc.text('SERVICE DE WILAYA DE SANTE', leftMargin, y(42));
  doc.text("DE L'ACTION SOCIAL ET ACTIVITES SPORTIVES", leftMargin, y(46));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`LE : ${logic.formatDateDisplay(options.date)}`, xOffset + 130, y(48), {
    align: 'right',
  });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setLineWidth(0.5);
  doc.roundedRect(centerX - 35, y(53), 70, 10, 2, 2);
  doc.text('CONVOCATION', centerX, y(60), { align: 'center' });

  const drawField = (label, value, posY) => {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(label, leftMargin, posY);

    const startDots = leftMargin + doc.getTextWidth(label) + 2;
    const endDots = xOffset + 135;
    let dots = '';
    while (doc.getTextWidth(dots) < endDots - startDots) {
      dots += '.';
    }
    doc.text(dots, startDots, posY);

    doc.setFont('helvetica', 'bold');
    doc.text(value, startDots + 5, posY - 1);
  };

  const nomPrenom = `${worker.last_name || ''} ${worker.first_name || ''}`;
  const service = `${worker.deptName || ''} ${
    worker.workplaceName ? '(' + worker.workplaceName + ')' : ''
  }`;

  drawField('M./Mme :', nomPrenom, y(75));
  drawField('Service :', service, y(85));
  drawField('Matricule :', worker.national_id || '', y(95));

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Est convoqué(e) à se présenter au Service Médical le :', leftMargin, y(115));

  const rdvDate = options.consultDate || options.date;
  const rdvTime = options.consultTime || '08:30';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${logic.formatDateDisplay(rdvDate)} à ${rdvTime}`, centerX, y(130), {
    align: 'center',
  });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Objet : Visite Médicale de Médecine du Travail.', leftMargin, y(145));
  doc.text('La présence est obligatoire.', leftMargin, y(155));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Le Médecin', xOffset + 110, y(180));
}

// ==========================================
// 2. LISTE DE CONVOCATION (PORTRAIT - GROUPÉE)
// ==========================================
function generateGroupedList(doc, workers, options) {
  const groups = {};
  workers.forEach((w) => {
    const deptName = w.deptName || 'Service Inconnu';
    if (!groups[deptName]) groups[deptName] = [];
    groups[deptName].push(w);
  });

  const deptNames = Object.keys(groups);

  deptNames.forEach((dept, i) => {
    if (i > 0) doc.addPage();

    const centerX = 105;
    const leftMargin = MARGIN;

    // --- HEADER OFFICIEL ---
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');

    doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, 15, { align: 'center' });

    doc.setFontSize(8);
    doc.text("MINISTERE DE L'INTERIEUR ET DE TRANSPORT", leftMargin, 22);
    doc.text('DIRECTION GENERALE DE LA SURETE NATIONALE', leftMargin, 26);
    doc.text("SURETE DE WILAYA D'IN-SALAH", leftMargin, 30);
    doc.text('SERVICE DE WILAYA DE SANTE', leftMargin, 34);
    doc.text("DE L'ACTION SOCIAL ET ACTIVITES SPORTIVES", leftMargin, 38);

    // --- TITRE ---
    doc.setFontSize(16);
    doc.text(`LISTE DE CONVOCATION`, centerX, 50, { align: 'center' });

    // Info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`SERVICE : ${dept.toUpperCase()}`, leftMargin, 65);

    const rdvDate = options.consultDate || options.date;
    const rdvTime = options.consultTime || '08:30';
    doc.text(`DATE PRÉVUE : ${logic.formatDateDisplay(rdvDate)} à ${rdvTime}`, leftMargin, 72);

    doc.setFontSize(10);
    doc.text(`Le : ${logic.formatDateDisplay(options.date)}`, 190, 65, { align: 'right' });

    // --- TABLEAU ---
    let y = 80;
    doc.setFillColor(230, 230, 230);
    doc.rect(leftMargin, y - 6, 170, 8, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');

    doc.text('Matricule', leftMargin + 2, y);
    doc.text('Nom et Prénom', leftMargin + 30, y);
    doc.text('Poste / Lieu', leftMargin + 90, y);
    // [CHANGE] "Visa" -> "Observation"
    doc.text('Observation', leftMargin + 140, y);

    y += 10;
    doc.setFont('helvetica', 'normal');

    groups[dept].forEach((w) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(w.national_id ? String(w.national_id) : '-', leftMargin + 2, y);
      doc.text(w.full_name, leftMargin + 30, y);
      doc.text(w.workplaceName || '-', leftMargin + 90, y);
      doc.line(leftMargin, y + 2, 190, y + 2);
      y += 12;
    });

    // --- PIED DE PAGE ---
    // [CHANGE] Signature du Médecin + Note légale
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Le Médecin', 160, 265); // Signature en bas à droite

    // Note légale brève
    doc.setFontSize(9);
    doc.setTextColor(80);
    const note = 'Rappel : Visite médicale obligatoire tous les 6 mois.';
    doc.text(note, centerX, 285, { align: 'center' });
    doc.setTextColor(0);
  });
}

// ==========================================
// 3. DEMANDE COPRO (PAYSAGE)
// ==========================================
function drawCoproRequest(doc, worker, options, xOffset) {
  const centerX = xOffset + 74.25;
  const leftMargin = xOffset + 10;
  const y = (val) => val;

  let nom = worker.last_name || '';
  let prenom = worker.first_name || '';
  if (!nom && !prenom && worker.full_name) {
    const parts = worker.full_name.trim().split(/\s+/);
    if (parts.length > 0) {
      nom = parts[0];
      prenom = parts.slice(1).join(' ');
    }
  }

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, y(15), { align: 'center' });
  doc.setFontSize(8);
  doc.text("MINISTERE DE L'INTERIEUR ET", leftMargin, y(22));
  doc.text('DE TRANSPORT', leftMargin, y(26));
  doc.text('DIRECTION GENERALE', leftMargin, y(30));
  doc.text('DE LA SURETE NATIONALE', leftMargin, y(34));
  doc.text("SURETE DE WILAYA D'IN-SALAH", leftMargin, y(38));
  doc.text('SERVICE DE WILAYA DE SANTE', leftMargin, y(42));
  doc.text("DE L'ACTION SOCIAL ET DES ACTIVITES SPORTIVES", leftMargin, y(46));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`LE : ${logic.formatDateDisplay(options.date)}`, xOffset + 130, y(48), {
    align: 'right',
  });

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setLineWidth(0.5);
  doc.roundedRect(centerX - 30, y(53), 60, 10, 2, 2);
  doc.text('ORDONNANCE', centerX, y(60), { align: 'center' });

  const drawField = (label, value, posY) => {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(label, leftMargin, posY);
    const startDots = leftMargin + doc.getTextWidth(label) + 2;
    const endDots = xOffset + 135;
    let dots = '';
    while (doc.getTextWidth(dots) < endDots - startDots) {
      dots += '.';
    }
    doc.text(dots, startDots, posY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const centerDots = startDots + (endDots - startDots) / 2;
    doc.text(value, centerDots, posY - 1, { align: 'center' });
  };

  drawField('Nom :', nom, y(80));
  drawField('Prénom :', prenom, y(90));
  drawField('Age :', worker.age ? String(worker.age) + ' ans' : '', y(100));

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Cher confrère,', leftMargin, y(120));
  doc.text('Permettez-moi de vous confier le patient sus-nommé pour :', leftMargin, y(130));
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Une Copro-parasitologie des selles', centerX, y(145), { align: 'center' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Cordialement.', leftMargin + 100, y(165), { align: 'center' });

  doc.setLineWidth(0.3);
  doc.line(leftMargin, y(190), xOffset + 138, y(190));
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('NB : Ne pas laisser les médicaments à la portée des enfants.', centerX, y(196), {
    align: 'center',
  });
}

// ==========================================
// 4. CERTIFICAT APTITUDE (PORTRAIT)
// ==========================================
function drawAptitudeCertificate(doc, worker, options, offset, workplaceMap) {
  const y = (val) => offset + val;
  const centerX = 105;
  let nom = worker.last_name || '';
  let prenom = worker.first_name || '';
  if (!nom && !prenom && worker.full_name) {
    const parts = worker.full_name.trim().split(/\s+/);
    if (parts.length > 0) {
      nom = parts[0];
      prenom = parts.slice(1).join(' ');
    }
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, y(10), { align: 'center' });
  doc.setFontSize(9);
  doc.text('DIRECTION GENERALE DE LA SURETE NATIONALE', centerX, y(18), { align: 'center' });
  doc.text("SURETE DE WILAYA D'IN-SALAH", centerX, y(23), { align: 'center' });
  doc.text('SERVICE DE WILAYA DE SANTE', centerX, y(28), { align: 'center' });
  doc.text("DE L'ACTION SOCIAL ET DES ACTIVITES SPORTIVES", centerX, y(33), { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(`LE : ${logic.formatDateDisplay(options.date)}`, 160, y(38));

  const status = worker.latest_status;
  const drawDynamicField = (label, value, startX, startY, dotLength) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(label, startX, startY);
    const labelWidth = doc.getTextWidth(label);
    const dotsStartX = startX + labelWidth + 2;
    let dots = '';
    while (doc.getTextWidth(dots) < dotLength) {
      dots += '.';
    }
    doc.text(dots, dotsStartX, startY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const valueWidth = doc.getTextWidth(value);
    const centerDots = dotsStartX + dotLength / 2;
    if (valueWidth > dotLength) doc.text(value, dotsStartX, startY - 1);
    else doc.text(value, centerDots, startY - 1, { align: 'center' });
  };

  if (status === 'apte_partielle') {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("CERTIFICAT D'APTITUDE AU POSTE DE TRAVAIL", centerX, y(48), { align: 'center' });
    doc.text('(AVEC AMÉNAGEMENT)', centerX, y(54), { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Je soussigné Dr ........................................................ certifie avoir examiné ce jour :`,
      MARGIN,
      y(62)
    );
    drawDynamicField('Nom:', nom, MARGIN, y(70), 65);
    drawDynamicField('Prénom:', prenom, MARGIN + 85, y(70), 65);
    doc.setFont('helvetica', 'normal');
    doc.text('Et déclare que son état de santé actuel est :', MARGIN, y(78));
    doc.setFont('helvetica', 'bold');
    doc.text('APTE AU TRAVAIL AVEC RESTRICTIONS TEMPORAIRES', centerX, y(85), { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      "L'employé est autorisé à travailler, mais avec des restrictions temporaires strictes.",
      MARGIN,
      y(92)
    );
    doc.setFont('helvetica', 'bold');
    doc.text('Interdictions formelles :', MARGIN, y(97));
    doc.setFont('helvetica', 'normal');
    doc.text("* Aucune manipulation d'aliments crus (salades, fruits).", MARGIN + 5, y(101));
    doc.text(
      '* Aucun contact à mains nues avec des plats cuits (dressage, sandwichs).',
      MARGIN + 5,
      y(105)
    );
    doc.setFont('helvetica', 'bold');
    doc.text('Tâches autorisées uniquement :', MARGIN, y(111));
    doc.setFont('helvetica', 'normal');
    doc.text('* Poste de cuisson (grill, four, friteuse).', MARGIN + 5, y(115));
    doc.text('* Préparation de légumes destinés à une cuisson immédiate.', MARGIN + 5, y(119));
    doc.text('* Plonge et nettoyage des locaux.', MARGIN + 5, y(123));
    doc.setFont('helvetica', 'bold');
    doc.text('Hygiène imposée :', MARGIN, y(129));
    doc.setFont('helvetica', 'normal');
    doc.text(
      'Port de gants obligatoire en continu et lavage des mains au savon bactéricide chaque heure.',
      MARGIN + 28,
      y(129)
    );
    doc.setFont('helvetica', 'bold');
    doc.text('Durée :', MARGIN, y(134));
    doc.setFont('helvetica', 'normal');
    doc.text(
      "Valable jusqu'à la fin du traitement et l'obtention de résultats d'analyses médicales satisfaisants.",
      MARGIN + 12,
      y(134)
    );
    doc.setFontSize(11);
    doc.text('Le Médecin', 160, y(140));
  } else {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICAT MEDICAL', centerX, y(55), { align: 'center' });
    drawDynamicField('Nom:', nom, MARGIN, y(70), 70);
    drawDynamicField('Prénom:', prenom, MARGIN + 90, y(70), 70);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Je soussigné certifie que le(la) susnommé(e) est :', MARGIN, y(82));
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    if (status === 'apte') {
      doc.text('APTE', centerX, y(95), { align: 'center' });
    } else if (status === 'inapte') {
      doc.text('INAPTE', centerX, y(95), { align: 'center' });
    } else {
      doc.setFontSize(14);
      doc.text("EN COURS D'ÉVALUATION", centerX, y(95), { align: 'center' });
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const wpName = (worker.workplaceName || '').trim();
    const wpLower = wpName.toLowerCase();
    let customText = workplaceMap ? workplaceMap.get(wpLower) : null;
    let textLieu;
    if (customText) {
      textLieu = customText;
    } else {
      if (wpLower.includes('cuisine')) textLieu = 'A travailler dans la CUISINE';
      else if (wpLower.includes('foyer')) textLieu = 'A travailler dans le FOYER';
      else if (wpLower.includes('coiffure')) textLieu = 'A travailler dans le SALON DE COIFFURE';
      else textLieu = 'A travailler dans : ' + (wpName || '________________');
    }
    doc.text(textLieu, centerX, y(110), { align: 'center' });
    const ySignature = y(125);
    if (worker.next_exam_due) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const nextDate = logic.formatDateDisplay(worker.next_exam_due);
      doc.text(`Prochaine visite avant le : ${nextDate}`, MARGIN, ySignature);
    }
    doc.setFontSize(11);
    doc.text('Le Médecin', 160, ySignature);
  }

  if (worker.next_exam_due && logic.isOverdue(worker.next_exam_due)) {
    try {
      doc.saveGraphicsState();
      doc.setTextColor(255, 0, 0);
      doc.setFontSize(30);
      doc.setFont('helvetica', 'bold');
      if (doc.GState) {
        doc.setGState(new doc.GState({ opacity: 0.3 }));
      }
      const centerY = offset + 74;
      doc.text('[ EN RETARD ]', 105, centerY, { align: 'center', angle: 35 });
      doc.restoreGraphicsState();
    } catch (e) {
      doc.setTextColor(255, 0, 0);
      doc.text('[ EN RETARD ]', 105, offset + 80, { align: 'center' });
      doc.setTextColor(0);
    }
  }
}

function drawHeader(doc) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICE DE MÉDECINE DU TRAVAIL', MARGIN, 20);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 25, 190, 25);
}

function drawFooter(doc) {
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Généré par Copro Watch', 105, pageHeight - 10, { align: 'center' });
  doc.setTextColor(0);
}

// ==========================================
// 5. CERTIFICAT APTITUDE PORT D'ARME (PORTRAIT)
// ==========================================
function drawWeaponAptitude(doc, agent, options) {
  const centerX = 105;
  const y = (val) => val;

  // HEADER OFFICIEL
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, y(15), { align: 'center' });
  doc.setFontSize(9);
  doc.text('DIRECTION GENERALE DE LA SURETE NATIONALE', centerX, y(23), { align: 'center' });
  doc.text("SURETE DE WILAYA D'IN-SALAH", centerX, y(28), { align: 'center' });
  doc.text('SERVICE DE WILAYA DE SANTE', centerX, y(28), { align: 'center' });
  doc.text("COMMISSION MEDICALE D'APTITUDE AU PORT D'ARME", centerX, y(38), { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.text(`LE : ${logic.formatDateDisplay(options.date || new Date())}`, 160, y(45));

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text("CERTIFICAT D'APTITUDE", centerX, y(60), { align: 'center' });

  const drawField = (label, value, posY) => {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(label, MARGIN, posY);
    const startDots = MARGIN + doc.getTextWidth(label) + 2;
    const endDots = 180;
    let dots = '';
    while (doc.getTextWidth(dots) < endDots - startDots) dots += '.';
    doc.text(dots, startDots, posY);
    doc.setFont('helvetica', 'bold');
    doc.text(String(value), startDots + 5, posY - 1);
  };

  drawField('Nom et Prénom :', agent.full_name, y(80));
  drawField('Matricule :', agent.national_id, y(90));
  drawField('Service :', agent.deptName || '-', y(100));
  drawField('Poste / Grade :', agent.job_function || '-', y(110));

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('La Commission Médicale, après examen clinique et psychologique, déclare l\'intéressé(e) :', MARGIN, y(130));

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  const decision = agent.status === 'apte' ? 'APTE' : 'INAPTE';
  doc.text(decision, centerX, y(150), { align: 'center' });

  if (agent.status === 'apte') {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text("Pour le port et la détention d'arme de service.", centerX, y(165), { align: 'center' });
  }

  const ySig = y(200);
  if (agent.next_review_date) {
    doc.setFontSize(11);
    doc.text(`Prochaine révision : ${logic.formatDateDisplay(agent.next_review_date)}`, MARGIN, ySig);
  }
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Le Médecin Chef', 150, ySig);
}