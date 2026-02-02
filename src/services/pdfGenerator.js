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
  /**
   * Génère un PDF pour les TRAVAILLEURS (Batch ou Individuel)
   */
  generateBatchDoc: async (workers, docType, options = {}) => {
    const doc = new jsPDF('p', 'mm', 'a4');

    if (docType === 'list_manager') {
      // MODE SMART : Liste groupée par service pour les chefs
      generateGroupedList(doc, workers, options);
    } else {
      // MODE INDIVIDUEL : Une page par travailleur
      workers.forEach((worker, index) => {
        // Ajouter une page pour chaque travailleur (sauf le premier)
        if (index > 0) doc.addPage();

        // 1. En-tête standard
        drawHeader(doc);

        // 2. Contenu spécifique
        switch (docType) {
          case 'convocation':
            drawConvocation(doc, worker, options);
            break;
          case 'copro':
            drawCoproRequest(doc, worker); // Indépendant du service/groupe
            break;
          case 'aptitude':
            drawSmartAptitude(doc, worker, options);
            break;
          default:
            doc.text('Type de document inconnu', MARGIN, 50);
        }

        // 3. Pied de page standard
        drawFooter(doc);
      });
    }

    // [FIX] SAUVEGARDE HYBRIDE (Mobile & Web)
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `CoproWatch_${docType}_${dateStr}.pdf`;

    // Wait for Capacitor to be ready before checking platform
    await initCapacitor();
    
    if (Capacitor.isNativePlatform()) {
      // 📱 ANDROID: Write to Documents
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
      // 💻 WEB: Download
      doc.save(fileName);
    }
  }, // End of generateBatchDoc
};

// ==========================================
// 1. FONCTIONS SMART (MANAGERS)
// ==========================================
function generateGroupedList(doc, workers, options) {
  // A. Grouper les travailleurs par nom de département
  const groups = {};
  workers.forEach((w) => {
    const deptName = w.deptName || 'Service Inconnu';
    if (!groups[deptName]) groups[deptName] = [];
    groups[deptName].push(w);
  });

  // B. Générer une page (ou plus) par département
  const deptNames = Object.keys(groups);

  deptNames.forEach((dept, i) => {
    if (i > 0) doc.addPage();

    // 1. EN-TÊTE
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('COPRO WATCH - SANTÉ AU TRAVAIL', MARGIN, 15);
    doc.line(MARGIN, 18, 190, 18);

    doc.setFontSize(14);
    doc.text(`LISTE D'ÉMARGEMENT`, 105, 30, { align: 'center' });

    // Ligne Service + Date de demande
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`SERVICE : ${dept.toUpperCase()}`, MARGIN, 45);

    // [NEW] Date de demande (Date du document) affichée à droite
    doc.setFontSize(10);
    doc.text(`Date demande : ${logic.formatDateDisplay(options.date)}`, 130, 45);

    // Ligne Rendez-vous
    doc.setFontSize(12);
    // [UPDATED] Affichage de la Date ET de l'Heure de Consultation
    const rdvDate = options.consultDate || options.date;
    const rdvTime = options.consultTime || '08:30';

    doc.text(`Date prévue : ${logic.formatDateDisplay(rdvDate)}`, MARGIN, 52);
    doc.text(`Heure : ${rdvTime}`, MARGIN + 80, 52);

    // 2. TABLEAU
    let y = 60;
    doc.setFillColor(230, 230, 230);
    doc.rect(MARGIN, y - 6, 170, 8, 'F'); // Fond gris
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');

    // En-têtes des colonnes
    doc.text('Matricule', MARGIN + 2, y);
    doc.text('Nom et Prénom', MARGIN + 25, y);
    doc.text('Lieu (Poste)', MARGIN + 80, y);
    doc.text('Émargement', MARGIN + 130, y);

    // 3. REMPLISSAGE DU TABLEAU
    y += 10;
    doc.setFont('helvetica', 'normal');

    groups[dept].forEach((w) => {
      // Saut de page si tableau trop long
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      doc.text(w.national_id ? String(w.national_id) : '-', MARGIN + 2, y);
      doc.text(w.full_name, MARGIN + 25, y);

      // Lieu de travail spécifique
      const lieu = w.workplaceName || '-';
      doc.text(lieu, MARGIN + 80, y);

      // Ligne de signature
      doc.line(MARGIN, y + 2, 190, y + 2);
      y += 12; // Espace entre les lignes
    });

    // 4. NOTE DE BAS DE PAGE
    doc.setFontSize(8);
    doc.text('Le Chef de Service est prié de faire signer les employés convoqués.', 105, 285, {
      align: 'center',
    });
  });
}

// ==========================================
// 2. DOCUMENTS INDIVIDUELS (SMART)
// ==========================================

function drawSmartAptitude(doc, worker, options) {
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text("FICHE D'APTITUDE MÉDICALE", 105, 50, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');

  const y = 80;
  doc.text(`Je soussigné, Docteur en médecine du travail,`, MARGIN, y);
  doc.text(`Certifie avoir examiné ce jour :`, MARGIN, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text(`Nom : ${worker.full_name}`, MARGIN + 10, y + 20);
  doc.text(`Matricule : ${worker.national_id || '-'}`, MARGIN + 10, y + 30);

  // Affichage hiérarchique : Service > Lieu
  const locationText = `${worker.deptName || ''} ${
    worker.workplaceName ? ' / ' + worker.workplaceName : ''
  }`;
  doc.text(`Affectation : ${locationText}`, MARGIN + 10, y + 40);

  doc.text('CONCLUSION :', MARGIN, y + 60);

  // LOGIQUE SMART : Lecture du statut réel
  const status = worker.latest_status;

  doc.setFontSize(14);
  if (status === 'apte') {
    doc.setTextColor(0, 100, 0); // Vert
    doc.text('• APTE au poste de travail', MARGIN + 10, y + 75);
  } else if (status === 'inapte') {
    doc.setTextColor(200, 0, 0); // Rouge
    doc.text('• INAPTE TEMPORAIRE', MARGIN + 10, y + 75);

    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'italic');
    doc.text('(Nécessite une réévaluation médicale avant reprise)', MARGIN + 10, y + 82);
  } else if (status === 'apte_partielle') {
    doc.setTextColor(204, 102, 0); // Orange
    doc.text('• APTE SOUS RÉSERVE', MARGIN + 10, y + 75);

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.text('Restrictions : Pas de port de charge lourde.', MARGIN + 10, y + 82);
  } else {
    // Cas par défaut ou "en attente"
    doc.setTextColor(100, 100, 100); // Gris
    doc.text("• EN COURS D'ÉVALUATION", MARGIN + 10, y + 75);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'italic');
    doc.text("(Aptitude différée dans l'attente des résultats d'examens)", MARGIN + 10, y + 82);
  }

  doc.setTextColor(0); // Reset noir
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  // [NEW] Affichage de la prochaine échéance calculée
  if (worker.next_exam_due) {
    const nextDate = logic.formatDateDisplay(worker.next_exam_due);
    doc.text(`Prochaine visite obligatoire avant le : ${nextDate}`, MARGIN, y + 100);
  }

  doc.text(`Fait le : ${logic.formatDateDisplay(options.date)}`, MARGIN, y + 115);
  doc.text('Le Médecin du Travail', 140, y + 135);
}

function drawConvocation(doc, worker, options) {
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CONVOCATION MÉDICALE', 105, 50, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');

  const y = 80;
  doc.text(`M./Mme : ${worker.full_name}`, MARGIN, y);

  const serviceInfo = worker.deptName || 'Service Inconnu';
  const lieuInfo = worker.workplaceName ? `(Lieu : ${worker.workplaceName})` : '';

  doc.text(`Service : ${serviceInfo} ${lieuInfo}`, MARGIN, y + 10);

  doc.text(`Vous êtes convoqué(e) à la visite médicale prévue le :`, MARGIN, y + 30);

  // [NEW] Utilisation de la date/heure de consultation spécifique
  // Si consultDate n'est pas fourni (ex: ancienne version), on utilise options.date par défaut
  const rdvDate = options.consultDate || options.date;
  const rdvTime = options.consultTime || '08:30';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${logic.formatDateDisplay(rdvDate)} à ${rdvTime}`, MARGIN + 20, y + 45);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Merci de vous munir de ce document et votre carnet de santé.', MARGIN, y + 65);
  doc.text('La présence est obligatoire.', MARGIN, y + 72);

  // Date de signature en bas (C'est la date de création "Aujourd'hui")
  doc.setFontSize(11);
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
  doc.text(`Nom et Prénom : ${worker.full_name}`, MARGIN, y);
  doc.text(`Matricule : ${worker.national_id || '-'}`, MARGIN, y + 10);
  doc.text(`Date : ${logic.formatDateDisplay(new Date())}`, MARGIN, y + 20);

  doc.setFont('helvetica', 'bold');
  doc.text('Indication :', MARGIN, y + 40);
  doc.setFont('helvetica', 'normal');
  doc.text('Dépistage systématique (Restauration / Hygiène)', MARGIN + 30, y + 40);

  doc.text('Prière de réaliser un examen parasitologique des selles.', MARGIN, y + 55);
  doc.text('Recherche de kystes, amibes et parasites.', MARGIN, y + 63);

  doc.rect(MARGIN - 5, y + 80, 180, 40); // Cadre résultats
  doc.text('RÉSULTATS (Réservé au laboratoire) :', MARGIN, y + 88);

  doc.text('Cachet du Médecin', 130, y + 140);
}

// ==========================================
// 3. UTILITAIRES COMMUNS
// ==========================================

function drawHeader(doc) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ENTREPRISE / COPROPRIÉTÉ', MARGIN, 15);

  doc.setFont('helvetica', 'normal');
  doc.text('SERVICE DE MÉDECINE DU TRAVAIL', MARGIN, 20);

  // Ligne de séparation
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 25, 190, 25);
}

function drawFooter(doc) {
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Généré par Copro Watch - Usage interne uniquement', 105, pageHeight - 10, {
    align: 'center',
  });
  doc.setTextColor(0); // Remettre en noir
}
