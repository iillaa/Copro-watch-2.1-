import { jsPDF } from 'jspdf';
import { logic } from './logic';

// [FIX] Proper dynamic import handling for Capacitor
let Filesystem, Directory;
let Capacitor = { isNativePlatform: () => false };
let capacitorReady = false;

// Initialize Capacitor modules properly
async function initCapacitor() {
  if (capacitorReady) return;
  
  try {
    const capModule = await import('@capacitor/core');
    Capacitor = capModule.Capacitor;
    
    const fsModule = await import('@capacitor/filesystem');
    Filesystem = fsModule.Filesystem;
    Directory = fsModule.Directory;
    
    capacitorReady = true;
    console.log('[PDF] Capacitor modules loaded successfully');
  } catch (e) {
    console.warn('[PDF] Capacitor not available:', e);
    capacitorReady = true; // Mark as ready to avoid repeated attempts
  }
}

// Call initialization immediately
if (typeof window !== 'undefined') {
  initCapacitor();
}

const MARGIN = 20;

export const pdfService = {
  generateBatchDoc: async (workers, docType, options = {}) => {
    const doc = new jsPDF('p', 'mm', 'a4');

    if (docType === 'list_manager') {
      generateGroupedList(doc, workers, options);
    } else if (docType === 'aptitude') {
      // MODE APTITUDE (2 certificats par page A4)
      for (let i = 0; i < workers.length; i++) {
        if (i > 0 && i % 2 === 0) {
          doc.addPage();
        }

        // Haut (0) ou Bas (148.5)
        const yOffset = i % 2 === 0 ? 0 : 148.5;
        
        drawAptitudeCertificate(doc, workers[i], options, yOffset);
        
        // Ligne de coupe
        if (i % 2 === 0 && i < workers.length - 1) {
             doc.setLineDash([2, 2], 0);
             doc.setDrawColor(150);
             doc.line(10, 148.5, 200, 148.5);
             doc.setDrawColor(0);
             doc.setLineDash([]); 
        }
      }
    } else {
      workers.forEach((worker, index) => {
        if (index > 0) doc.addPage();
        drawHeader(doc);
        switch (docType) {
          case 'convocation':
            drawConvocation(doc, worker, options);
            break;
          case 'copro':
            drawCoproRequest(doc, worker);
            break;
          default:
            doc.text('Type de document inconnu', MARGIN, 50);
        }
        drawFooter(doc);
      });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `CoproWatch_${docType}_${dateStr}.pdf`;

    await initCapacitor();
    
    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = doc.output('datauristring').split(',')[1];
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
        });
        alert(`✅ Fichier sauvegardé dans Documents :\n${fileName}`);
      } catch (e) {
        console.error(e);
        alert('❌ Erreur de sauvegarde. Vérifiez les permissions.');
      }
    } else {
      doc.save(fileName);
    }
  },
};

// ==========================================
// CERTIFICAT APTITUDE (Format Police - 2/page)
// ==========================================
function drawAptitudeCertificate(doc, worker, options, offset) {
  const y = (val) => offset + val; 
  const centerX = 105;

  // --- PREPARATION DONNEES ---
  let nom = worker.last_name || '';
  let prenom = worker.first_name || '';

  if (!nom && !prenom && worker.full_name) {
      const parts = worker.full_name.trim().split(/\s+/);
      if (parts.length > 0) {
          nom = parts[0];
          prenom = parts.slice(1).join(' ');
      }
  }

  // --- EN-TÊTE ---
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  doc.text('REPUBLIQUE ALGERIENNE DEMOCRATIQUE ET POPULAIRE', centerX, y(10), { align: 'center' });

  doc.setFontSize(9);
  doc.text('DIRECTION GENERALE DE LA SURETE NATIONALE', centerX, y(18), { align: 'center' });
  doc.text("SURETE DE WILAYA D'IN-SALAH", centerX, y(23), { align: 'center' });
  doc.text('SERVICE DE WILAYA DE SANTE', centerX, y(28), { align: 'center' });
  doc.text("DE L'ACTION SOCIAL ET DES SPORTS", centerX, y(33), { align: 'center' });

  // Date
  doc.setFont('helvetica', 'normal');
  doc.text(`LE : ${logic.formatDateDisplay(options.date)}`, 160, y(38));

  const status = worker.latest_status; 

  // --- HELPER DYNAMIQUE POUR NOM/PRENOM ---
  // Dessine: "Label: ............ Value ............"
  const drawDynamicField = (label, value, startX, startY, dotLength) => {
    // 1. Dessiner le Label (ex: "Nom:")
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(label, startX, startY);
    
    // Mesurer le label pour savoir où commencer les points
    const labelWidth = doc.getTextWidth(label);
    const dotsStartX = startX + labelWidth + 2; // +2mm marge
    
    // 2. Dessiner les pointillés
    // On génère une chaîne de points qui correspond à peu près à dotLength
    // Astuce simple : On dessine une ligne pointillée manuelle ou des caractères "."
    // Ici on utilise des caractères "." pour matcher le style "Word"
    // On estime qu'un point fait ~1mm (très approximatif), on remplit la zone.
    // Mieux: On dessine une vraie ligne pointillée pour être propre.
    // doc.setLineDash([1, 1], 0);
    // doc.line(dotsStartX, startY + 1, dotsStartX + dotLength, startY + 1);
    // doc.setLineDash([]);
    
    // Alternative "Style Word" (texte) :
    let dots = "";
    while(doc.getTextWidth(dots) < dotLength) {
        dots += ".";
    }
    doc.text(dots, dotsStartX, startY);

    // 3. Dessiner la Valeur (Centrée ou Gauche)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    
    const valueWidth = doc.getTextWidth(value);
    const centerDots = dotsStartX + (dotLength / 2);
    
    if (valueWidth > dotLength) {
        // Trop long : On aligne à gauche (sur le début des points)
        doc.text(value, dotsStartX, startY - 1); 
    } else {
        // Ça rentre : On centre sur les points
        doc.text(value, centerDots, startY - 1, { align: 'center' });
    }
    
    // Retourne la position X finale pour enchainer si besoin
    return dotsStartX + dotLength;
  };

  // === CAS 1 : APTE PARTIELLE ===
  if (status === 'apte_partielle') {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("CERTIFICAT D'APTITUDE AU POSTE DE TRAVAIL", centerX, y(48), { align: 'center' });
    doc.text("(AVEC AMÉNAGEMENT)", centerX, y(54), { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Je soussigné Dr ........................ certifie avoir examiné ce jour :`, MARGIN, y(62));
    
    // [FIX] NOM / PRENOM DYNAMIQUE
    // Largeur dispo = 170mm. 
    // Nom: (space 60mm) | Prénom: (space 60mm)
    drawDynamicField("Nom:", nom, MARGIN, y(70), 65);
    drawDynamicField("Prénom:", prenom, MARGIN + 85, y(70), 65);

    doc.setFont('helvetica', 'normal');
    doc.text("Et déclare que son état de santé actuel est :", MARGIN, y(78));
    
    doc.setFont('helvetica', 'bold');
    doc.text("APTE AU TRAVAIL AVEC RESTRICTIONS TEMPORAIRES", centerX, y(85), { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text("L'employé est autorisé à travailler, mais avec des restrictions temporaires strictes.", MARGIN, y(92));

    doc.setFont('helvetica', 'bold');
    doc.text("Interdictions formelles :", MARGIN, y(97));
    doc.setFont('helvetica', 'normal');
    doc.text("* Aucune manipulation d'aliments crus (salades, fruits).", MARGIN + 5, y(101));
    doc.text("* Aucun contact à mains nues avec des plats cuits (dressage, sandwichs).", MARGIN + 5, y(105));

    doc.setFont('helvetica', 'bold');
    doc.text("Tâches autorisées uniquement :", MARGIN, y(111));
    doc.setFont('helvetica', 'normal');
    doc.text("* Poste de cuisson (grill, four, friteuse).", MARGIN + 5, y(115));
    doc.text("* Préparation de légumes destinés à une cuisson immédiate.", MARGIN + 5, y(119));
    doc.text("* Plonge et nettoyage des locaux.", MARGIN + 5, y(123));

    doc.setFont('helvetica', 'bold');
    doc.text("Hygiène imposée :", MARGIN, y(129));
    doc.setFont('helvetica', 'normal');
    doc.text("Port de gants obligatoire en continu et lavage des mains au savon bactéricide chaque heure.", MARGIN + 28, y(129));

    doc.setFont('helvetica', 'bold');
    doc.text("Durée :", MARGIN, y(134));
    doc.setFont('helvetica', 'normal');
    doc.text("Valable jusqu'à la fin du traitement et l'obtention de résultats d'analyses médicales satisfaisants.", MARGIN + 12, y(134));

    doc.setFontSize(11);
    doc.text("Le Médecin", 160, y(140)); 

  } else {
    // === CAS 2 : STANDARD ===
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text("CERTIFICAT MEDICAL", centerX, y(55), { align: 'center' });

    // [FIX] NOM / PRENOM DYNAMIQUE (Plus large car moins de texte en dessous)
    // On peut donner plus d'espace (~70mm chacun)
    drawDynamicField("Nom:", nom, MARGIN, y(70), 70);
    drawDynamicField("Prénom:", prenom, MARGIN + 90, y(70), 70);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text("Je soussigné certifie que le(la) susnommé(e) est :", MARGIN, y(82));

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    
    if (status === 'apte') {
      doc.text("APTE", centerX, y(95), { align: 'center' });
    } else if (status === 'inapte') {
      doc.text("INAPTE", centerX, y(95), { align: 'center' });
    } else {
      doc.setFontSize(14);
      doc.text("EN COURS D'ÉVALUATION", centerX, y(95), { align: 'center' });
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    
    const workplace = (worker.workplaceName || '').toLowerCase();
    let textLieu = "A travailler dans : " + (worker.workplaceName || '________________');

    if (workplace.includes('cuisine')) {
      textLieu = "A travailler dans la CUISINE";
    } else if (workplace.includes('foyer')) {
      textLieu = "A travailler dans le FOYER";
    } else if (workplace.includes('coiffure')) {
        textLieu = "A travailler dans le SALON DE COIFFURE";
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
    doc.text("Le Médecin", 160, ySignature); 
  }

  // WATERMARK EN RETARD (Confiné)
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
      
      doc.text('[ EN RETARD ]', 105, centerY, { 
        align: 'center', 
        angle: 35 
      });

      doc.restoreGraphicsState();
    } catch (e) {
      doc.setTextColor(255, 0, 0);
      doc.text('[ EN RETARD ]', 105, offset + 80, { align: 'center' });
      doc.setTextColor(0);
    }
  }
}

// ==========================================
// AUTRES FONCTIONS (Inchangées)
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
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('COPRO WATCH - SANTÉ AU TRAVAIL', MARGIN, 15);
    doc.line(MARGIN, 18, 190, 18);
    doc.setFontSize(14);
    doc.text(`LISTE D'ÉMARGEMENT`, 105, 30, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`SERVICE : ${dept.toUpperCase()}`, MARGIN, 45);
    doc.setFontSize(10);
    doc.text(`Date : ${logic.formatDateDisplay(options.date)}`, 150, 45);
    const rdvDate = options.consultDate || options.date;
    const rdvTime = options.consultTime || '08:30';
    doc.setFontSize(12);
    doc.text(`Date prévue : ${logic.formatDateDisplay(rdvDate)} à ${rdvTime}`, MARGIN, 52);
    let y = 60;
    doc.setFillColor(230, 230, 230);
    doc.rect(MARGIN, y - 6, 170, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Matricule', MARGIN + 2, y);
    doc.text('Nom et Prénom', MARGIN + 25, y);
    doc.text('Lieu (Poste)', MARGIN + 80, y);
    doc.text('Émargement', MARGIN + 130, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
    groups[dept].forEach((w) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(w.national_id ? String(w.national_id) : '-', MARGIN + 2, y);
      doc.text(w.full_name, MARGIN + 25, y);
      doc.text(w.workplaceName || '-', MARGIN + 80, y);
      doc.line(MARGIN, y + 2, 190, y + 2);
      y += 12;
    });
    doc.setFontSize(8);
    doc.text('Le Chef de Service est prié de faire signer les employés.', 105, 285, { align: 'center' });
  });
}

function drawConvocation(doc, worker, options) {
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CONVOCATION MÉDICALE', 105, 50, { align: 'center' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const y = 80;
  doc.text(`M./Mme : ${worker.full_name}`, MARGIN, y);
  doc.text(`Service : ${worker.deptName || ''} (${worker.workplaceName || ''})`, MARGIN, y + 10);
  doc.text(`Vous êtes convoqué(e) à la visite médicale :`, MARGIN, y + 30);
  const rdvDate = options.consultDate || options.date;
  const rdvTime = options.consultTime || '08:30';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${logic.formatDateDisplay(rdvDate)} à ${rdvTime}`, MARGIN + 20, y + 45);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('La présence est obligatoire.', MARGIN, y + 70);
  doc.text(`Fait le : ${logic.formatDateDisplay(options.date)}`, MARGIN, y + 100);
  doc.text('Le Médecin du Travail', 140, y + 110);
}

function drawCoproRequest(doc, worker) {
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text("DEMANDE D'EXAMEN", 105, 40, { align: 'center' });
  doc.text('COPROPARASITOLOGIE', 105, 48, { align: 'center' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const y = 70;
  doc.text(`Nom : ${worker.full_name}`, MARGIN, y);
  doc.text(`Matricule : ${worker.national_id || '-'}`, MARGIN, y + 10);
  doc.text('Prière de réaliser un examen parasitologique des selles.', MARGIN, y + 40);
  doc.rect(MARGIN - 5, y + 60, 180, 40); 
  doc.text('RÉSULTATS :', MARGIN, y + 68);
  doc.text('Cachet', 130, y + 120);
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