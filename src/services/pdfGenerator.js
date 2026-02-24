import { logic } from './logic';
import { db } from './db';

// CSS Constants
const STYLE = `
  @page { margin: 0; }
  body {
    font-family: 'Helvetica', sans-serif;
    margin: 0;
    padding: 0;
    background: white;
    -webkit-print-color-adjust: exact;
  }
  .page {
    position: relative;
    box-sizing: border-box;
    page-break-after: always;
    overflow: hidden;
  }
  .page.portrait { width: 210mm; height: 296mm; }
  .page.landscape { width: 297mm; height: 209mm; }

  .list-page {
    width: 210mm;
    min-height: 296mm;
    padding: 10mm;
    box-sizing: border-box;
    page-break-after: always;
  }

  .page:last-child, .list-page:last-child { page-break-after: auto; }

  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }

  .half-page-h { height: 148mm; position: relative; border-bottom: 1px dashed #ccc; box-sizing: border-box; padding: 10mm; }
  .half-page-h:last-child { border-bottom: none; }

  .half-page-v { width: 148mm; height: 100%; float: left; position: relative; border-right: 1px dashed #ccc; box-sizing: border-box; padding: 10mm; }
  .half-page-v:last-child { border-right: none; }

  .header { text-align: center; margin-bottom: 10mm; }
  .header h1 { font-size: 11pt; font-weight: bold; margin: 0; text-transform: uppercase; }
  .header h2 { font-size: 9pt; font-weight: normal; margin: 2px 0; }

  .title-box {
    border: 2px solid black;
    border-radius: 8px;
    padding: 5px 20px;
    display: inline-block;
    font-weight: bold;
    font-size: 14pt;
    margin: 10px 0;
  }

  .field-row { margin-bottom: 8px; font-size: 11pt; display: flex; align-items: baseline; }
  .field-label { white-space: nowrap; margin-right: 5px; }
  .field-dots { flex: 1; border-bottom: 1px dotted black; position: relative; }
  .field-value { position: absolute; left: 10px; bottom: 2px; font-weight: bold; font-size: 12pt; }

  .signature { position: absolute; bottom: 20mm; right: 20mm; font-weight: bold; font-size: 11pt; }
  .footer-note { position: absolute; bottom: 5mm; width: 100%; text-align: center; font-size: 8pt; color: #888; }

  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { background: #eee; font-weight: bold; padding: 5px; border: 1px solid black; text-align: left; }
  td { padding: 5px; border: 1px solid black; }

  .watermark {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 80pt;
    color: rgba(255, 0, 0, 0.1);
    font-weight: bold;
    pointer-events: none;
    z-index: 0;
  }
`;

export const pdfService = {
  generateBatchDoc: async (workers, docType, options = {}) => {
    // 1. Fetch Workplaces for Aptitude Text
    const workplaceMap = new Map();
    if (docType === 'aptitude') {
      try {
        const all = await db.getWorkplaces();
        all.forEach(wp => {
          if (wp.name && wp.certificate_text) workplaceMap.set(wp.name.toLowerCase().trim(), wp.certificate_text);
        });
      } catch(e) {}
    }

    // 2. Build HTML
    let html = '';
    const isLandscape = ['copro', 'convocation', 'weapon_convocation_individual'].includes(docType);

    if (docType === 'aptitude') {
      // Portrait, 2 per page
      for (let i = 0; i < workers.length; i += 2) {
        html += `<div class="page portrait">`;
        html += generateAptitudeItem(workers[i], options, workplaceMap);
        if (i + 1 < workers.length) {
          html += generateAptitudeItem(workers[i+1], options, workplaceMap);
        }
        html += `</div>`;
      }
    } else if (docType === 'copro' || docType === 'convocation') {
      // Landscape, 2 per page (Side by Side)
      for (let i = 0; i < workers.length; i += 2) {
        html += `<div class="page landscape">`;
        html += `<div class="half-page-v" style="width: 50%; float: left; border-right: 1px dashed #ccc; height: 100%">`;
        html += docType === 'copro' ? generateCoproItem(workers[i], options) : generateConvocationItem(workers[i], options);
        html += `</div>`;

        if (i + 1 < workers.length) {
          html += `<div class="half-page-v" style="width: 50%; float: left; border: none; height: 100%">`;
          html += docType === 'copro' ? generateCoproItem(workers[i+1], options) : generateConvocationItem(workers[i+1], options);
          html += `</div>`;
        }
        html += `</div>`;
      }
    } else if (docType === 'weapon_aptitude') {
       // Portrait, 1 per page
       workers.forEach(w => {
         html += `<div class="page portrait" style="padding: 20mm">`;
         html += generateWeaponAptitudeItem(w, options);
         html += `</div>`;
       });
    } else if (docType === 'weapon_convocation_individual') {
       // Portrait, 1 per page (Matches previous logic, though previous code function said 'Landscape' but implementation was Portrait-like?
       // Wait, previous code `drawWeaponConvocationIndividual` used `centerX = 105` which is Portrait center.
       // But `generateBatchDoc` for it didn't set landscape.
       // So I will stick to Portrait for Individual Weapon Convocation as per previous logic.
       // Correction: My variable `isLandscape` above included it. I should remove it if it's portrait.
       // Looking at previous code: `drawWeaponConvocationIndividual` used `centerX = 105`. That's Portrait (A4 width 210).
       workers.forEach(w => {
         html += `<div class="page portrait" style="padding: 20mm">`;
         html += generateWeaponConvocationIndividual(w, options);
         html += `</div>`;
       });
    } else if (['list_manager', 'weapon_convocation_list', 'weapon_registre'].includes(docType)) {
       html += generateLists(workers, docType, options);
    }

    // 3. Print
    printHTML(html, isLandscape && docType !== 'weapon_convocation_individual' ? 'landscape' : 'portrait');
  }
};

const printHTML = (content, orientation) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Print</title>
        <style>
          @page { size: A4 ${orientation}; margin: 0; }
          ${STYLE}
        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, 500);
};

// --- GENERATORS ---

const getHeader = () => `
  <div class="header">
    <h1>Republique Algerienne Democratique et Populaire</h1>
    <h2>MINISTERE DE L'INTERIEUR ET DES COLLECTIVITES LOCALES</h2>
    <h2>DIRECTION GENERALE DE LA SURETE NATIONALE</h2>
    <h2>SURETE DE WILAYA D'IN-SALAH</h2>
    <h2>SERVICE DE WILAYA DE SANTE, DE L'ACTION SOCIALE ET DES SPORTS</h2>
  </div>
`;

const generateAptitudeItem = (w, opts, wpMap) => {
  const isApte = w.latest_status === 'apte';
  const isPartiel = w.latest_status === 'apte_partielle';
  const statusText = isApte ? 'APTE' : (w.latest_status === 'inapte' ? 'INAPTE' : 'EN COURS');

  let workplaceText = '';
  if (wpMap) {
     const wpName = (w.workplaceName || '').trim().toLowerCase();
     workplaceText = wpMap.get(wpName);
  }
  if (!workplaceText) {
     const wpLower = (w.workplaceName || '').toLowerCase();
     if (wpLower.includes('cuisine')) workplaceText = 'A travailler dans la CUISINE';
     else if (wpLower.includes('foyer')) workplaceText = 'A travailler dans le FOYER';
     else workplaceText = `A travailler dans : ${w.workplaceName || '________'}`;
  }

  const isOverdue = w.next_exam_due && logic.isOverdue(w.next_exam_due);

  return `
    <div class="half-page-h">
      ${getHeader()}
      <div class="text-right" style="margin-bottom: 20px">Le : ${logic.formatDateDisplay(opts.date)}</div>

      <div style="text-align: center">
        <div class="title-box">CERTIFICAT D'APTITUDE</div>
      </div>

      <div style="margin-top: 20px">
        <div class="field-row">
          <span class="field-label">Je soussigné certifie que M/Mme :</span>
          <div class="field-dots"><span class="field-value">${w.full_name}</span></div>
        </div>
        <div class="field-row">
          <span class="field-label">Est reconnu(e) :</span>
        </div>

        <div style="text-align: center; font-size: 24pt; font-weight: bold; margin: 20px 0; letter-spacing: 5px">
          ${statusText}
        </div>

        <div style="text-align: center; font-size: 12pt; margin-bottom: 20px">
          ${workplaceText}
        </div>

        ${w.next_exam_due ? `<div style="font-size: 10pt">Prochaine visite avant le : <b>${logic.formatDateDisplay(w.next_exam_due)}</b></div>` : ''}
      </div>

      <div class="signature">Le Médecin</div>

      ${isOverdue ? `<div class="watermark">EN RETARD</div>` : ''}
    </div>
  `;
};

const generateCoproItem = (w, opts) => {
  return `
    <div>
      ${getHeader()}
      <div class="text-right" style="margin-bottom: 10px">Le : ${logic.formatDateDisplay(opts.date)}</div>
      <div style="text-align: center; margin-bottom: 20px">
        <div class="title-box">ORDONNANCE</div>
      </div>

      <div class="field-row"><span class="field-label">Nom & Prénom :</span><div class="field-dots"><span class="field-value">${w.full_name}</span></div></div>
      <div class="field-row"><span class="field-label">Age :</span><div class="field-dots"><span class="field-value">${w.age ? w.age + ' ans' : ''}</span></div></div>

      <div style="margin-top: 30px; font-size: 12pt">
        <p>Cher confrère,</p>
        <p>Prière de pratiquer pour le patient sus-nommé :</p>
        <h3 style="text-align: center; margin: 30px 0; text-decoration: underline">Une Copro-parasitologie des selles</h3>
      </div>

      <div class="signature">Le Médecin</div>
      <div class="footer-note" style="border-top: 1px solid black; padding-top: 5px; margin-top: 50px">
         NB: Ne pas laisser les médicaments à la portée des enfants.
      </div>
    </div>
  `;
};

const generateConvocationItem = (w, opts) => {
  return `
    <div>
      ${getHeader()}
      <div class="text-right" style="margin-bottom: 10px">Le : ${logic.formatDateDisplay(opts.date)}</div>
      <div style="text-align: center; margin-bottom: 20px">
        <div class="title-box">CONVOCATION</div>
      </div>

      <div class="field-row"><span class="field-label">M./Mme :</span><div class="field-dots"><span class="field-value">${w.full_name}</span></div></div>
      <div class="field-row"><span class="field-label">Matricule :</span><div class="field-dots"><span class="field-value">${w.national_id || ''}</span></div></div>
      <div class="field-row"><span class="field-label">Service :</span><div class="field-dots"><span class="field-value">${w.deptName || ''}</span></div></div>

      <div style="margin-top: 20px; font-size: 12pt">
        <p>Est convoqué(e) au Service Médical le :</p>
        <div style="text-align: center; font-size: 14pt; font-weight: bold; margin: 15px 0">
           ${logic.formatDateDisplay(opts.consultDate)} à ${opts.consultTime || '08:30'}
        </div>
        <p>Objet : Visite Médicale de Médecine du Travail.</p>
        <p style="font-weight: bold">La présence est obligatoire.</p>
      </div>

      <div class="signature">Le Médecin</div>
    </div>
  `;
};

const generateWeaponAptitudeItem = (w, opts) => {
  const isApte = w.status === 'apte';
  return `
    <div>
       ${getHeader()}
       <div style="text-align: center; font-weight: bold; margin-bottom: 10mm">COMMISSION MEDICALE D'APTITUDE AU PORT D'ARME</div>
       <div class="text-right" style="margin-bottom: 20px">Le : ${logic.formatDateDisplay(opts.date)}</div>

       <div style="text-align: center; margin-bottom: 30px">
         <div class="title-box" style="font-size: 18pt">CERTIFICAT D'APTITUDE</div>
       </div>

       <div style="padding: 0 10mm">
          <div class="field-row"><span class="field-label">Nom & Prénom :</span><div class="field-dots"><span class="field-value">${w.full_name}</span></div></div>
          <div class="field-row"><span class="field-label">Matricule :</span><div class="field-dots"><span class="field-value">${w.national_id}</span></div></div>
          <div class="field-row"><span class="field-label">Grade / Poste :</span><div class="field-dots"><span class="field-value">${w.job_function || ''}</span></div></div>

          <div style="margin-top: 30px">
            <p>La Commission Médicale, après examen clinique et psychologique, déclare l'intéressé(e) :</p>
            <div style="text-align: center; font-size: 36pt; font-weight: bold; margin: 40px 0; color: ${isApte ? 'black' : 'red'}">
               ${isApte ? 'APTE' : 'INAPTE'}
            </div>
            ${isApte ? '<p style="text-align: center">Pour le port et la détention d\'arme de service.</p>' : ''}
          </div>
       </div>

       <div class="signature">Le Médecin Chef</div>
    </div>
  `;
};

const generateWeaponConvocationIndividual = (w, opts) => {
  return `
    <div>
       ${getHeader()}
       <div style="text-align: center; font-size: 16pt; font-weight: bold; margin: 30mm 0 10mm 0">
         CONVOCATION MÉDICALE<br/>(APTITUDE AU PORT D'ARME)
       </div>

       <div style="padding: 0 10mm; font-size: 14pt; line-height: 1.6">
          <div><b>M. ${w.full_name}</b></div>
          <div>Matricule : ${w.national_id}</div>
          <div style="margin-bottom: 20px">Service : ${w.deptName || '-'}</div>

          <p>Est convoqué(e) pour sa visite d'aptitude au port d'arme le :</p>
          <div style="text-align: center; font-size: 20pt; font-weight: bold; margin: 20px 0">
             ${logic.formatDateDisplay(opts.consultDate)} à ${opts.consultTime || '08:30'}
          </div>
          <p>La présence est obligatoire muni de sa pièce d'identité.</p>
       </div>

       <div class="signature" style="bottom: 40mm">Le Médecin Chef</div>
       <div class="footer-note" style="text-align: left; padding-left: 20mm">Fait le : ${logic.formatDateDisplay(opts.date)}</div>
    </div>
  `;
};

const generateLists = (workers, type, opts) => {
  // Group by Dept
  const groups = {};
  workers.forEach(w => {
    const d = w.deptName || 'Autre';
    if (!groups[d]) groups[d] = [];
    groups[d].push(w);
  });

  let html = '';
  const title = type === 'weapon_registre' ? 'REGISTRE DE SUIVI' : 'LISTE DE CONVOCATION';
  const isWeapon = type.includes('weapon');

  // For Registry, just one big list usually, but let's keep group logic if needed.
  // Actually registry is usually one continuous table.
  if (type === 'weapon_registre') {
     html += `<div class="list-page">
       ${getHeader()}
       <div style="text-align: center; font-weight: bold; font-size: 14pt; margin: 20px 0">${title}</div>
       <div style="display: flex; justify-content: space-between; margin-bottom: 10px">
         <span>Total : ${workers.length} agents</span>
         <span>Date : ${logic.formatDateDisplay(opts.date)}</span>
       </div>
       <table>
         <thead>
           <tr>
             <th width="5%">N°</th>
             <th width="15%">Matricule</th>
             <th width="25%">Nom & Prénom</th>
             <th width="20%">Service</th>
             <th width="15%">Date</th>
             <th width="10%">Décision</th>
             <th width="10%">Prochaine</th>
           </tr>
         </thead>
         <tbody>
           ${workers.map((w, i) => `
             <tr>
               <td>${i+1}</td>
               <td>${w.national_id}</td>
               <td>${w.full_name}</td>
               <td>${w.deptName || ''}</td>
               <td>${logic.formatDateDisplay(w.last_exam_date || w.exam_date)}</td>
               <td style="font-weight: bold; color: ${w.status === 'apte' ? 'green' : 'red'}">${w.status === 'apte' ? 'APTE' : 'INAPTE'}</td>
               <td>${logic.formatDateDisplay(w.next_review_date)}</td>
             </tr>
           `).join('')}
         </tbody>
       </table>
       <div class="signature">Le Médecin Chef</div>
     </div>`;
  } else {
    // Convocations Lists
    Object.keys(groups).forEach(dept => {
      html += `<div class="list-page">
         ${getHeader()}
         <div style="text-align: center; font-weight: bold; font-size: 14pt; margin: 20px 0">${title}</div>

         <div style="margin-bottom: 10px; font-weight: bold">SERVICE : ${dept}</div>
         <div style="margin-bottom: 20px">DATE PRÉVUE : ${logic.formatDateDisplay(opts.consultDate)} à ${opts.consultTime || '08:30'}</div>

         <table>
           <thead>
             <tr>
               <th width="15%">Matricule</th>
               <th width="35%">Nom & Prénom</th>
               <th width="25%">Poste / Grade</th>
               <th width="25%">Observation / Émargement</th>
             </tr>
           </thead>
           <tbody>
             ${groups[dept].map(w => `
               <tr style="height: 10mm">
                 <td>${w.national_id || ''}</td>
                 <td>${w.full_name}</td>
                 <td>${w.job_function || w.job_role || ''}</td>
                 <td></td>
               </tr>
             `).join('')}
           </tbody>
         </table>
         <div class="signature">Le Médecin</div>
      </div>`;
    });
  }
  return html;
};

