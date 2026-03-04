import { jsPDF } from 'jspdf';
import { logic } from './logic';
import { db } from './db';
import { AMIRI_FONT_BASE64 } from '../assets/amiriFont';

// --- [ELITE] HYBRID CANVAS RENDERER V3 ---
let fontInjected = false;
const ensureFontInjected = () => {
  if (fontInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.innerHTML = `
    @font-face {
      font-family: 'AmiriPDF';
      src: url(data:font/truetype;charset=utf-8;base64,${AMIRI_FONT_BASE64}) format('truetype');
    }
  `;
  document.head.appendChild(style);
  fontInjected = true;
};

const isArabic = (text) => /[\u0600-\u06FF]/.test(text);

/**
 * Renders Arabic text to a high-res Transparent PNG
 */
const renderArabicToImage = (text, fontSize = 12, isBold = false) => {
  ensureFontInjected();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const scale = 4; // High resolution
  
  // [ELITE FIX] Increase the font size for Arabic specifically
  const boostedFontSize = fontSize * 1.25; 
  
  const fontWeight = isBold ? 'bold' : 'normal';
  ctx.font = `${fontWeight} ${boostedFontSize * scale}px AmiriPDF, serif`;
  
  const metrics = ctx.measureText(text);
  const width = metrics.width + 20;
  const height = boostedFontSize * 1.8 * scale;
  
  canvas.width = width;
  canvas.height = height;
  
  ctx.font = `${fontWeight} ${boostedFontSize * scale}px AmiriPDF, serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center'; // Center the text inside the snapshot canvas
  ctx.fillStyle = 'black';
  
  ctx.fillText(text, width / 2, height / 2);
  
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: width / scale,
    height: height / scale
  };
};

const drawTextSafe = (doc, text, x, y, options = {}) => {
  const strText = String(text || '');
  if (isArabic(strText)) {
    const fontSize = options.fontSize || doc.getFontSize() || 11;
    const isBold = options.fontStyle === 'bold';
    const imgData = renderArabicToImage(strText, fontSize, isBold);
    
    // Precise Conversion: px to mm (Standard 96dpi)
    const mmW = (imgData.width) * (25.4 / 96);
    const mmH = (imgData.height) * (25.4 / 96);
    
    let finalX = x;
    if (options.align === 'right') {
      finalX = x - mmW;
    } else if (options.align === 'center') {
      finalX = x - (mmW / 2);
    }

    // Y offset adjustment to match baseline of standard text
    const yOffset = mmH * 0.22; 
    doc.addImage(imgData.dataUrl, 'PNG', finalX, y - mmH + yOffset, mmW, mmH);
  } else {
    doc.setFont('helvetica', options.fontStyle || 'normal');
    doc.text(strText, x, y, options);
  }
};

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
    capacitorReady = true;
  }
}

if (typeof window !== 'undefined') {
  initCapacitor();
}

const MARGIN = 20;

export const pdfService = {
  generateBatchDoc: async (workers, docType, options = {}) => {
    const isArMode = options.language === 'ar';
    const isLandscape = docType === 'copro' || docType === 'convocation';
    const orientation = isLandscape ? 'l' : 'p';
    const doc = new jsPDF(orientation, 'mm', 'a4');

    // [ELITE] Language Mapping: Use the correct field based on current Globe state
    const localizedWorkers = workers.map(w => ({
      ...w,
      full_name: isArMode && w.full_name_ar ? w.full_name_ar : w.full_name,
      job_role: isArMode && w.job_role_ar ? w.job_role_ar : w.job_role,
      job_function: isArMode && w.job_function_ar ? w.job_function_ar : w.job_function,
      deptName: isArMode && w.deptName_ar ? w.deptName_ar : w.deptName
    }));

    const workplaceMap = new Map();
    if (docType === 'aptitude') {
      try {
        const allWorkplaces = await db.getWorkplaces();
        allWorkplaces.forEach((wp) => {
          if (wp.name && wp.certificate_text) {
            workplaceMap.set(wp.name.toLowerCase().trim(), wp.certificate_text);
          }
        });
      } catch (e) {}
    }

    if (docType === 'list_manager') {
      generateGroupedList(doc, localizedWorkers, options);
    } else if (docType === 'weapon_registre') {
      generateWeaponRegistrePortrait(doc, localizedWorkers, options);
    } else if (docType === 'weapon_convocation_list') {
      generateWeaponConvocationList(doc, localizedWorkers, options);
    } else if (docType === 'weapon_convocation_individual') {
      for (let i = 0; i < localizedWorkers.length; i++) {
        if (i > 0) doc.addPage();
        drawWeaponConvocationIndividual(doc, localizedWorkers[i], options);
      }
    } else if (docType === 'weapon_aptitude') {
      localizedWorkers.forEach((agent, index) => {
        if (index > 0) doc.addPage();
        drawWeaponAptitude(doc, agent, options);
      });
    } else if (docType === 'aptitude') {
      for (let i = 0; i < localizedWorkers.length; i++) {
        if (i > 0 && i % 2 === 0) doc.addPage();
        const yOffset = i % 2 === 0 ? 0 : 148.5;
        drawAptitudeCertificate(doc, localizedWorkers[i], options, yOffset, workplaceMap);

        if (i % 2 === 0 && i < localizedWorkers.length - 1) {
          doc.setLineDash([2, 2], 0);
          doc.setDrawColor(150);
          doc.line(10, 148.5, 200, 148.5);
          doc.setDrawColor(0);
          doc.setLineDash([]);
        }
      }
    } else if (docType === 'copro' || docType === 'convocation') {
      for (let i = 0; i < localizedWorkers.length; i++) {
        if (i > 0 && i % 2 === 0) doc.addPage();
        const xOffset = i % 2 === 0 ? 0 : 148.5;

        if (docType === 'copro') {
          drawCoproRequest(doc, localizedWorkers[i], options, xOffset);
        } else {
          drawConvocation(doc, localizedWorkers[i], options, xOffset);
        }

        if (i % 2 === 0 && i < localizedWorkers.length - 1) {
          doc.setLineDash([2, 2], 0);
          doc.setDrawColor(150);
          doc.line(148.5, 10, 148.5, 200);
          doc.setDrawColor(0);
          doc.setLineDash([]);
        }
      }
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `CoproWatch_${docType}_${dateStr}_${timeStr}.pdf`;

    await initCapacitor();

    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = doc.output('datauristring').split(',')[1];
        const folder = 'copro-watch/Exports';
        try {
          await Filesystem.mkdir({
            path: folder,
            directory: Directory.Documents,
            recursive: true,
          });
        } catch (e) {}

        await Filesystem.writeFile({
          path: `${folder}/${fileName}`,
          data: base64Data,
          directory: Directory.Documents,
        });
        alert(`✅ PDF sauvegardé :\nDocuments/${folder}/${fileName}`);
      } catch (e) {
        alert('❌ Erreur de sauvegarde PDF.');
      }
    } else {
      doc.save(fileName);
    }
  },
};

// ==========================================
// 1. CONVOCATION INDIVIDUELLE (PAYSAGE)
// ==========================================
function drawConvocation(doc, worker, options, xOffset) {
  const centerX = xOffset + 74.25;
  const leftMargin = xOffset + 10;
  const y = (val) => val;

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
  doc.text(`LE : ${logic.formatDateDisplay(options.date)}`, xOffset + 130, y(48), { align: 'right' });

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
    while (doc.getTextWidth(dots) < endDots - startDots) dots += '.';
    doc.text(dots, startDots, posY);

    const valStr = String(value || '');
    // [CENTERED ARABIC]
    drawTextSafe(doc, valStr, (startDots + endDots) / 2, posY - 1, { align: 'center', fontStyle: 'bold', fontSize: 11 });
  };

  const name = worker.full_name_ar || worker.full_name || '';
  const service = `${worker.deptName || ''} ${worker.workplaceName ? '(' + worker.workplaceName + ')' : ''}`;

  drawField('M./Mme :', name, y(75));
  drawField('Service :', service, y(85));
  drawField('Matricule :', worker.national_id || '', y(95));

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Est convoqué(e) à se présenter au Service Médical le :', leftMargin, y(115));

  const rdvDate = options.consultDate || options.date;
  const rdvTime = options.consultTime || '08:30';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${logic.formatDateDisplay(rdvDate)} à ${rdvTime}`, centerX, y(130), { align: 'center' });

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

  Object.keys(groups).forEach((dept, i) => {
    if (i > 0) doc.addPage();
    const centerX = 105;
    const leftMargin = MARGIN;

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

    doc.setFontSize(16);
    doc.text(`LISTE DE CONVOCATION`, centerX, 50, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    drawTextSafe(doc, `SERVICE : ${dept.toUpperCase()}`, leftMargin, 65, { align: 'left' });

    const rdvDate = options.consultDate || options.date;
    const rdvTime = options.consultTime || '08:30';
    doc.text(`DATE PRÉVUE : ${logic.formatDateDisplay(rdvDate)} à ${rdvTime}`, leftMargin, 72);
    doc.text(`Le : ${logic.formatDateDisplay(options.date)}`, 190, 65, { align: 'right' });

    let y = 80;
    doc.setFillColor(230, 230, 230);
    doc.rect(leftMargin, y - 6, 170, 8, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Matricule', leftMargin + 2, y);
    doc.text('Nom et Prénom', leftMargin + 30, y);
    doc.text('Poste / Lieu', leftMargin + 90, y);
    doc.text('Observation', leftMargin + 140, y);

    y += 10;
    doc.setFont('helvetica', 'normal');
    groups[dept].forEach((w) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(String(w.national_id || '-'), leftMargin + 2, y);
      
      const name = w.full_name_ar || w.full_name || '-';
      drawTextSafe(doc, name, leftMargin + 60, y, { align: 'center', fontSize: 10 });

      const wp = w.workplaceName || '-';
      drawTextSafe(doc, wp, leftMargin + 115, y, { align: 'center', fontSize: 9 });

      doc.line(leftMargin, y + 2, 190, y + 2);
      y += 12;
    });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Le Médecin', 160, 265);
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
    nom = parts[0];
    prenom = parts.slice(1).join(' ');
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
  doc.text(`LE : ${logic.formatDateDisplay(options.date)}`, xOffset + 130, y(48), { align: 'right' });

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
    while (doc.getTextWidth(dots) < endDots - startDots) dots += '.';
    doc.text(dots, startDots, posY);
    
    drawTextSafe(doc, value, (startDots + endDots) / 2, posY - 1, { align: 'center', fontStyle: 'bold', fontSize: 13 });
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
    nom = parts[0];
    prenom = parts.slice(1).join(' ');
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
    while (doc.getTextWidth(dots) < dotLength) dots += '.';
    doc.text(dots, dotsStartX, startY);
    
    drawTextSafe(doc, value, dotsStartX + dotLength / 2, startY - 1, { align: 'center', fontStyle: 'bold', fontSize: 13 });
  };

  if (status === 'apte_partielle') {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("CERTIFICAT D'APTITUDE AU POSTE DE TRAVAIL", centerX, y(48), { align: 'center' });
    doc.text('(AVEC AMÉNAGEMENT)', centerX, y(54), { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Je soussigné Dr ........................................................ certifie avoir examiné ce jour :`, MARGIN, y(62));
    drawDynamicField('Nom:', nom, MARGIN, y(70), 65);
    drawDynamicField('Prénom:', prenom, MARGIN + 85, y(70), 65);
    doc.setFont('helvetica', 'normal');
    doc.text('Et déclare que son état de santé actuel est :', MARGIN, y(78));
    doc.setFont('helvetica', 'bold');
    doc.text('APTE AU TRAVAIL AVEC RESTRICTIONS TEMPORAIRES', centerX, y(85), { align: 'center' });
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
    const decisionText = status === 'apte' ? 'APTE' : status === 'inapte' ? 'INAPTE' : "EN COURS D'ÉVALUATION";
    doc.text(decisionText, centerX, y(95), { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const wpName = (worker.workplaceName || '').trim();
    const wpLower = wpName.toLowerCase();
    let textLieu = workplaceMap.get(wpLower) || ('A travailler dans : ' + (wpName || '________________'));
    drawTextSafe(doc, textLieu, centerX, y(110), { align: 'center', fontSize: 13 });

    const ySignature = y(125);
    if (worker.next_exam_due) {
      doc.setFontSize(10);
      const nextDate = logic.formatDateDisplay(worker.next_exam_due);
      doc.text(`Prochaine visite avant le : ${nextDate}`, MARGIN, ySignature);
    }
    doc.setFontSize(11);
    doc.text('Le Médecin', 160, ySignature);
  }
}

// ==========================================
// 5. CERTIFICAT APTITUDE PORT D'ARME (PORTRAIT)
// ==========================================
function drawWeaponAptitude(doc, agent, options) {
  const centerX = 105;
  const y = (val) => val;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, y(15), { align: 'center' });
  doc.setFontSize(9);
  doc.text('DIRECTION GENERALE DE LA SURETE NATIONALE', centerX, y(23), { align: 'center' });
  doc.text("SURETE DE WILAYA D'IN-SALAH", centerX, y(28), { align: 'center' });
  doc.text('SERVICE DE WILAYA DE SANTE', centerX, y(33), { align: 'center' });
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
    
    const valStr = String(value || '');
    drawTextSafe(doc, valStr, (startDots + endDots) / 2, posY - 1, { align: 'center', fontStyle: 'bold', fontSize: 13 });
  };

  const name = agent.full_name_ar || agent.full_name || '';
  const job = agent.job_function_ar || agent.job_function || '-';

  drawField('Nom et Prénom :', name, y(80));
  drawField('Matricule :', agent.national_id, y(90));
  drawField('Service :', agent.deptName || '-', y(100));
  drawField('Poste / Grade :', job, y(110));

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text("La Commission Médicale, après examen clinique et psychologique, déclare l'intéressé(e) :", MARGIN, y(130));

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  const decision = agent.status === 'apte' ? 'APTE' : 'INAPTE';
  doc.text(decision, centerX, y(150), { align: 'center' });

  doc.setFontSize(11);
  doc.text('Le Médecin Chef', 150, y(200));
}

// ==========================================
// 6. LISTE DE CONVOCATION ARME (PORTRAIT - GROUPÉE)
// ==========================================
function generateWeaponConvocationList(doc, agents, options) {
  const groups = {};
  agents.forEach((a) => {
    const dName = a.deptName || 'Service Inconnu';
    if (!groups[dName]) groups[dName] = [];
    groups[dName].push(a);
  });

  Object.keys(groups).forEach((dept, i) => {
    if (i > 0) doc.addPage();
    const centerX = 105;
    const leftMargin = MARGIN;

    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, 15, { align: 'center' });
    doc.setFontSize(8);
    doc.text("MINISTERE DE L'INTERIEUR ET DE TRANSPORT", leftMargin, 22);
    doc.text('DIRECTION GENERALE DE LA SURETE NATIONALE', leftMargin, 26);
    doc.text("SURETE DE WILAYA D'IN-SALAH", leftMargin, 30);
    doc.text('SERVICE DE WILAYA DE SANTE', leftMargin, 34);

    doc.setFontSize(14);
    doc.text("CONVOCATION VISITE MÉDICALE (PORT D'ARME)", centerX, 50, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    drawTextSafe(doc, `SERVICE : ${dept.toUpperCase()}`, leftMargin, 65, { align: 'left' });
    
    const rdv = `${logic.formatDateDisplay(options.consultDate)} à ${options.consultTime || '08:30'}`;
    doc.text(`DATE PRÉVUE : ${rdv}`, leftMargin, 72);
    doc.text(`Le : ${logic.formatDateDisplay(options.date)}`, 190, 65, { align: 'right' });

    let y = 80;
    doc.setFillColor(230, 230, 230);
    doc.rect(leftMargin, y - 6, 170, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Matricule', leftMargin + 2, y);
    doc.text('Nom et Prénom', leftMargin + 30, y);
    doc.text('Grade / Poste', leftMargin + 90, y);
    doc.text('Émargement', leftMargin + 140, y);

    y += 10;
    doc.setFont('helvetica', 'normal');
    groups[dept].forEach((a) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(String(a.national_id || '-'), leftMargin + 2, y);
      
      const name = a.full_name_ar || a.full_name || '-';
      drawTextSafe(doc, name, leftMargin + 60, y, { align: 'center', fontSize: 10 });

      const job = a.job_function_ar || a.job_function || '-';
      drawTextSafe(doc, job, leftMargin + 115, y, { align: 'center', fontSize: 9 });

      doc.line(leftMargin, y + 2, 190, y + 2);
      y += 12;
    });

    doc.setFont('helvetica', 'bold');
    doc.text('Le Médecin Chef', 160, 270);
  });
}

// ==========================================
// 7. CONVOCATION ARME INDIVIDUELLE (PORTRAIT)
// ==========================================
function drawWeaponConvocationIndividual(doc, agent, options) {
  const centerX = 105;
  const leftMargin = MARGIN;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, 15, { align: 'center' });
  doc.setFontSize(8);
  doc.text("MINISTERE DE L'INTERIEUR", leftMargin, 22);
  doc.text('DIRECTION GENERALE DE LA SURETE NATIONALE', leftMargin, 26);
  doc.text('SERVICE DE WILAYA DE SANTE', leftMargin, 30);

  doc.setFontSize(16);
  doc.text('CONVOCATION MÉDICALE', centerX, 60, { align: 'center' });
  doc.text("(APTITUDE AU PORT D'ARME)", centerX, 68, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const yStart = 90;
  
  const name = agent.full_name_ar || agent.full_name || '';
  drawTextSafe(doc, `M. ${name}`, centerX, yStart, { align: 'center', fontSize: 13 });
  
  doc.text(`Matricule : ${agent.national_id}`, leftMargin, yStart + 10);
  
  const dName = agent.deptName || '-';
  drawTextSafe(doc, `Service : ${dName}`, centerX, yStart + 20, { align: 'center', fontSize: 13 });

  const rdv = `${logic.formatDateDisplay(options.consultDate)} à ${options.consultTime || '08:30'}`;
  doc.setFont('helvetica', 'bold');
  doc.text(`Est convoqué(e) pour sa visite d'aptitude au port d'arme le :`, leftMargin, yStart + 40);
  doc.setFontSize(14);
  doc.text(rdv, centerX, yStart + 55, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text("La présence est obligatoire muni de sa pièce d'identité.", leftMargin, yStart + 80);

  doc.setFont('helvetica', 'bold');
  doc.text('Le Médecin Chef', 150, 250);
}

// ==========================================
// 8. REGISTRE DE SUIVI (PORT D'ARME) - PORTRAIT
// ==========================================
function generateWeaponRegistrePortrait(doc, agents, options) {
  const centerX = 105;
  const leftMargin = 10;

  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, 12, { align: 'center' });
  doc.setFontSize(9);
  doc.text("MINISTERE DE L'INTERIEUR ET DES COLLECTIVITES TERRITORIALES", leftMargin, 20);
  doc.text('DIRECTION GENERALE DE LA SURETE NATIONALE', leftMargin, 26);
  doc.text("SURETE DE WILAYA D'IN-SALAH", leftMargin, 32);
  doc.text('SERVICE DE WILAYA DE SANTE', leftMargin, 38);
  doc.text("COMMISSION MEDICALE D'APTITUDE AU PORT D'ARME", leftMargin, 44);

  doc.setFontSize(14);
  doc.text('REGISTRE DE SUIVI MEDICAL', centerX, 56, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`Total des agents : ${agents.length}`, leftMargin, 66);
  doc.text(`Date d'établissement : ${logic.formatDateDisplay(options.date)}`, 200, 66, { align: 'right' });

  let y = 76;
  doc.setFillColor(50, 50, 50);
  doc.rect(leftMargin, y - 5, 190, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('N°', leftMargin + 2, y);
  doc.text('Matricule', leftMargin + 12, y);
  doc.text('Nom et Prénom', leftMargin + 42, y);
  doc.text('Service', leftMargin + 90, y);
  doc.text('Date', leftMargin + 125, y);
  doc.text('Décision', leftMargin + 150, y);
  doc.text('Prochaine', leftMargin + 172, y);

  y += 10;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  let rowNum = 1;
  agents.forEach((a) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
      doc.setFillColor(50, 50, 50);
      doc.rect(leftMargin, y - 5, 190, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('N°', leftMargin + 2, y);
      doc.text('Matricule', leftMargin + 12, y);
      doc.text('Nom et Prénom', leftMargin + 42, y);
      doc.text('Service', leftMargin + 90, y);
      doc.text('Date', leftMargin + 125, y);
      doc.text('Décision', leftMargin + 150, y);
      doc.text('Prochaine', leftMargin + 172, y);
      y += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
    }

    if (rowNum % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(leftMargin, y - 4, 190, 8, 'F');
    }

    const lastDate = a.last_exam_date || a.exam_date || '-';
    const decision = a.status === 'apte' ? 'APTE' : a.status === 'inapte_definitif' ? 'INAPTE DÉF.' : a.status === 'inapte_temporaire' ? 'INAPTE TEMP.' : '-';
    const nextDate = a.next_review_date || '-';

    doc.text(String(rowNum), leftMargin + 2, y);
    doc.text(String(a.national_id || '-'), leftMargin + 12, y);
    
    const name = a.full_name_ar || a.full_name || '-';
    drawTextSafe(doc, name, leftMargin + 66, y, { align: 'center', fontSize: 8 });

    const dName = a.deptName || '-';
    drawTextSafe(doc, dName, leftMargin + 107.5, y, { align: 'center', fontSize: 8 });
    
    doc.text(lastDate !== '-' ? logic.formatDateDisplay(lastDate) : '-', leftMargin + 125, y);

    if (decision === 'APTE') doc.setTextColor(0, 120, 0);
    else if (decision.includes('INAPTE')) doc.setTextColor(200, 0, 0);
    doc.text(decision, leftMargin + 150, y);
    doc.setTextColor(0, 0, 0);

    doc.text(nextDate !== '-' ? logic.formatDateDisplay(nextDate) : '-', leftMargin + 172, y);
    doc.line(leftMargin + 185, y - 2, leftMargin + 200, y - 2);

    y += 8;
    rowNum++;
  });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Le Médecin Chef', 160, 285);
}
