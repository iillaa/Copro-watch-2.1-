import { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { db } from '../services/db';
import {
  FaCamera,
  FaSpinner,
  FaSave,
  FaTimes,
  FaMagic,
  FaGlobeAfrica,
  FaEraser,
  FaPlus,
  FaBug,
  FaClipboardList,
  FaArrowsAltH,
  FaArrowsAltV,
  FaList,
  FaImage,
  FaEye,
} from 'react-icons/fa';

// --- ALG-FR TRANSLITERATION ENGINE ---
const transliterateArToFr = (text) => {
  if (!text) return '';
  const map = {
    ا: 'A',
    أ: 'A',
    إ: 'E',
    آ: 'A',
    ى: 'A',
    ة: 'A',
    ب: 'B',
    ت: 'T',
    ث: 'T',
    ج: 'DJ',
    ح: 'H',
    خ: 'KH',
    د: 'D',
    ذ: 'D',
    ر: 'R',
    ز: 'Z',
    س: 'S',
    ش: 'CH',
    ص: 'S',
    ض: 'D',
    ط: 'T',
    ظ: 'Z',
    ع: 'A',
    غ: 'GH',
    ف: 'F',
    ق: 'K',
    ك: 'K',
    ل: 'L',
    م: 'M',
    ن: 'N',
    ه: 'H',
    و: 'OU',
    ي: 'Y',
    ' ': ' ',
    '-': '-',
    '.': '.',
  };
  return text
    .split('')
    .map((char) => map[char] || char)
    .join('')
    .toUpperCase()
    .replace(/OUA/g, 'WA')
    .replace(/IY/g, 'I');
};

export default function UniversalOCRModal({
  mode = 'worker',
  onClose,
  onImportSuccess,
  departments,
}) {
  // ========== STATE ==========
  const [activeTab, setActiveTab] = useState('scan'); // 'scan' | 'results'
  const [image, setImage] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [docLanguage, setDocLanguage] = useState('fra');
  const [debugMode, setDebugMode] = useState(false);

  // LOGS: Full Array + Scroll
  const [logs, setLogs] = useState([]);
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  // Grid State
  const [vLines, setVLines] = useState([0.25, 0.5, 0.75]);
  const [hLines, setHLines] = useState([]);
  const [colMapping, setColMapping] = useState([
    'national_id',
    'full_name',
    'department_id',
    'job_info',
  ]);

  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);
  const canvasRef = useRef(null);

  const colOptions = [
    { val: 'national_id', label: 'Matricule' },
    { val: 'full_name', label: 'Nom & Prénom' },
    { val: 'department_id', label: 'Service' },
    { val: 'job_info', label: mode === 'worker' ? 'Poste' : 'Grade' },
    { val: 'ignore', label: 'Ignorer' },
  ];

  // ========== IMAGE LOADING ==========
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (!img.width || !img.height) {
            alert('Erreur: Image invalide.');
            return;
          }
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Cap resolution for Global Scan stability (Tesseract crash prevention)
          if (width > 2500) {
            const scale = 2500 / width;
            width = 2500;
            height = Math.round(height * scale);
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          // Fill white (Fix transparent PNGs returning black/0 words)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const cleanUrl = canvas.toDataURL('image/jpeg', 0.95);

          setImage(cleanUrl);
          setImgDimensions({ width, height });
          setCandidates([]);
          setHLines([]);
          setActiveTab('scan');

          setLogs([]); // Reset logs
          addLog(`[LOAD] Image chargée. Dimensions: ${width}x${height}px`);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  // Inside UniversalOCRModal component
  const [debugCrops, setDebugCrops] = useState([]); //

  // Helper to extract a cell with padding
// 1. IMPROVED: Adaptive Cell Processing (3x scaling + adaptive thresholding for Arabic)
const getCellImage = (imgElement, rect, paddingY = 15, paddingX = 8) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // 3x Scale for Arabic Density
  const scale = 3; 
  const targetW = (rect.width + paddingX * 2) * scale;
  const targetH = (rect.height + paddingY * 2) * scale;
  canvas.width = targetW;
  canvas.height = targetH;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    imgElement,
    rect.x, rect.y, rect.width, rect.height,
    paddingX * scale, paddingY * scale, rect.width * scale, rect.height * scale
  );

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const originalData = new Uint8ClampedArray(data); // Copy for neighbor checking

  // Fixed Threshold (Safer than Adaptive for faint text)
  const threshold = 180; 

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    
    // Standard Binarization
    let v = gray < threshold ? 0 : 255; 

    // DILATION (Thickening): If a neighbor pixel is black, make this one black too.
    // This connects broken Arabic letters and prevents "fading".
    if (v === 255 && i > 4) {
       const prevGray = 0.299 * originalData[i-4] + 0.587 * originalData[i-3] + 0.114 * originalData[i-2];
       if (prevGray < threshold) v = 0; // Spread the blackness
    }

    data[i] = data[i + 1] = data[i + 2] = v;
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

  // ========== VISUAL DEBUGGER ==========
  const drawDebugGrid = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) {
      addLog('[DEBUG ERROR] Impossible de dessiner (Canvas/Image manquant)');
      return;
    }
    const ctx = canvas.getContext('2d');
    canvas.width = imgDimensions.width;
    canvas.height = imgDimensions.height;

    try {
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      return;
    }

    const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);

    // Draw Rows
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 4;
    for (let r = 0; r < sortedH.length - 1; r++) {
      const y = sortedH[r] * canvas.height;
      const h = (sortedH[r + 1] - sortedH[r]) * canvas.height;
      ctx.strokeRect(0, y, canvas.width, h);
      ctx.fillStyle = 'red';
      ctx.font = 'bold 30px monospace';
      ctx.fillText(`ROW ${r + 1} (Y=${Math.round(y)})`, 20, y + 40);
    }

    // Draw Cols
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
    vLines.forEach((v, i) => {
      const x = v * canvas.width;
      ctx.strokeRect(x, 0, 2, canvas.height);
      ctx.fillStyle = 'blue';
      ctx.fillText(`C${i + 1}`, x + 5, 60);
    });

    addLog('[DEBUG] Grille dessinée dans le cadre jaune.');
  };

  // ========== MAIN OCR ENGINE ==========
  // --- OCR ENGINE (RTL + SORTED + CONDITIONAL) ---
  

// 2. UPDATED OCR ENGINE (With Safety Margin)
const runOCR = async () => {
    if (!image || !imageRef.current) return;
    if (debugMode) { drawDebugGrid(); return; }

    setLogs([]);
    setDebugCrops([]); // This will now show the clean, borderless images
    setIsProcessing(true);
    setCandidates([]);
    setProgress(0);

    let worker = null;
    try {
      const langs = docLanguage === 'ara' ? 'ara+fra' : 'fra';
      worker = await Tesseract.createWorker(langs, 1);
      
      const isRTL = docLanguage === 'ara';
      addLog(`[ENGINE] Scan ${isRTL ? 'RTL' : 'LTR'} (${langs})`);

      const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
      const results = [];
      const totalCells = (sortedH.length - 1) * (sortedV.length - 1);
      let cellsProcessed = 0;

      for (let r = 0; r < sortedH.length - 1; r++) {
        let candidate = createEmptyCandidate();
        let hasDataInRow = false;

        for (let c = 0; c < sortedV.length - 1; c++) {
          const colIndex = isRTL ? (sortedV.length - 2 - c) : c;
          const field = colMapping[colIndex];
          
          if (!field || field === 'ignore') {
             cellsProcessed++;
             continue;
          }

          // --- SAFETY MARGIN CALCULATION ---
         // Increased to 6px to definitely kill the borders like "|"
          const rawW = (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width;
          const rawH = (sortedH[r + 1] - sortedH[r]) * imgDimensions.height;
          const safetyMargin = 6; 

          const cropParams = {
            x: (sortedV[colIndex] * imgDimensions.width) + safetyMargin,
            y: (sortedH[r] * imgDimensions.height) + safetyMargin,
            width: rawW - (safetyMargin * 2),
            height: rawH - (safetyMargin * 2)
          };

          if (cropParams.width < 10 || cropParams.height < 10) continue;

          // Conditional Parameters
          if (field === 'national_id') {
             await worker.setParameters({
                tessedit_pageseg_mode: '7',
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-. ', 
             });
          } else {
             await worker.setParameters({
                tessedit_pageseg_mode: '7',
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: '', // Allow Arabic
             });
          }

          // Use 0 padding for getCellImage because safetyMargin handles the crop
          const cellUrl = getCellImage(imageRef.current, cropParams, 5, 0);
          const { data: { text, confidence } } = await worker.recognize(cellUrl);
          
          let cleanText = text.trim();
          
          // NOISE FILTER: If result is tiny Latin garbage in Arabic mode, ignore it
          if (isRTL && cleanText.length < 3 && /^[a-zA-Z\s|]+$/.test(cleanText)) {
             addLog(`[FILTER] Ignored noise "${cleanText}" in ${field}`);
             cleanText = "";
          }

          addLog(`[CELL] R${r+1}C${c+1} (${field}): "${cleanText}" | ${confidence}%`);

          if (cleanText) {
            candidate[field] = cleanText;
            hasDataInRow = true;
            // VISUAL DEBUG: This saves the EXACT image Tesseract saw
            setDebugCrops(prev => [...prev, { label: `R${r+1}C${c+1}`, url: cellUrl }]);
          }
          cellsProcessed++;
          setProgress(Math.round((cellsProcessed / totalCells) * 100));
        }

        if (hasDataInRow) {
          cleanCandidate(candidate);
          results.push(candidate);
        }
      }
      setCandidates(results);
      if(results.length > 0) setActiveTab('results');

    } catch (err) {
      addLog(`[CRASH] ${err.message}`);
    } finally {
      if (worker) await worker.terminate();
      setIsProcessing(false);
    }
};
  // --- FILTERING LOGIC (Detailed Logs) ---
  const filterWordsByGrid = (words, scanWidth, scanHeight) => {
    const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
    const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
    const results = [];

    addLog(
      `[FILTER] Application de la grille: ${sortedH.length - 1} Lignes, ${
        sortedV.length - 1
      } Colonnes`
    );

    for (let r = 0; r < sortedH.length - 1; r++) {
      const yMin = Math.floor(sortedH[r] * scanHeight);
      const yMax = Math.floor(sortedH[r + 1] * scanHeight);

      // 1. Log Row Boundaries
      // addLog(`--- Ligne ${r+1}: Y=${yMin} à ${yMax} ---`);

      if (yMax - yMin < 20) {
        addLog(`[Ligne ${r + 1}] Ignorée (trop petite < 20px)`);
        continue;
      }

      // 2. Filter Words by Y
      const rowWords = words.filter((w) => {
        const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
        return centerY >= yMin && centerY < yMax && w.confidence > 40;
      });

      if (rowWords.length === 0) {
        // Verbose: Explain why it's empty
        // const nearbyWords = words.filter(w => Math.abs(w.bbox.y0 - yMin) < 50);
        // addLog(`[Ligne ${r+1}] Vide. (Mots proches trouvés à Y=${nearbyWords.length > 0 ? nearbyWords[0].bbox.y0 : 'Aucun'})`);
        continue;
      }

      let candidate = createEmptyCandidate();
      let hasData = false;

      // Sort words Left -> Right
      rowWords.sort((a, b) => a.bbox.x0 - b.bbox.x0);

      // 3. Map to Columns
      rowWords.forEach((w) => {
        const centerX = (w.bbox.x0 + w.bbox.x1) / 2;
        const xPct = centerX / scanWidth;

        for (let c = 0; c < sortedV.length - 1; c++) {
          if (xPct >= sortedV[c] && xPct < sortedV[c + 1]) {
            const field = colMapping[c];
            if (field && field !== 'ignore') {
              const txt = w.text
                .replace(/[|\[\]{};:*!@#$%^&()]/g, '')
                .trim()
                .toUpperCase();
              candidate[field] = (candidate[field] ? candidate[field] + ' ' : '') + txt;
              hasData = true;
            }
            break;
          }
        }
      });

      if (hasData) {
        cleanCandidate(candidate);
        addLog(`[Ligne ${r + 1}] OK: ${candidate.national_id} | ${candidate.full_name}`);
        results.push(candidate);
      } else {
        addLog(`[Ligne ${r + 1}] Mots trouvés mais mapping colonne échoué.`);
      }
    }
    return results;
  };

  const parseTextToCandidates = (text) => {
    addLog('[PARSER] Analyse du texte brut (Ligne par ligne)...');
    const lines = text.split('\n');
    const results = [];
    lines.forEach((line) => {
      const tokens = line.trim().split(/\s+/);
      let matricule = '',
        nameParts = [];
      tokens.forEach((t) => {
        let clean = t.replace(/[^\w\d]/g, '').toUpperCase();
        // Typo fix
        if (/^[lIi]A/.test(clean)) clean = clean.replace(/^[lIi]/, '7');
        if (/^T[A-Z]/.test(clean)) clean = clean.replace(/^T/, '7');

        if ((/^\d{2,15}$/.test(clean) || /^\d+[A-Z]+\d+$/.test(clean)) && !matricule) {
          matricule = clean;
        } else if (clean.length > 1 && !['MAT', 'NOM', 'PRENOM'].includes(clean)) {
          nameParts.push(t);
        }
      });

      if (nameParts.length > 0) {
        let job = '';
        let name = nameParts.join(' ');
        // Smart Split: Last word is Job?
        if (colMapping.includes('job_info') && nameParts.length > 1) {
          job = nameParts.pop();
          name = nameParts.join(' ');
        }

        let cand = createEmptyCandidate();
        cand.national_id = matricule || '?';
        cand.full_name = name.toUpperCase();
        cand.job_info = job.toUpperCase();
        cleanCandidate(cand);
        results.push(cand);
      }
    });
    return results;
  };

  // --- HELPERS ---
  const createEmptyCandidate = () => ({
    id: Math.random(),
    national_id: '',
    full_name: '',
    department_id: '',
    job_info: '',
    isArabic: false,
  });

  const cleanCandidate = (c) => {
    if (c.national_id) c.national_id = c.national_id.replace(/^[lIiT]A/, '7A').replace(/O/g, '0');
    c.isArabic = /[\u0600-\u06FF]/.test(c.full_name);
    if (c.isArabic) c.original_name = c.full_name;
  };

  const updateCandidate = (id, field, val) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: val } : c)));
  };
  const removeCandidate = (id) => setCandidates((prev) => prev.filter((c) => c.id !== id));

  const handleBulkImport = async () => {
    if (candidates.length === 0) return;
    const valid = candidates.filter((c) => c.full_name || c.national_id);
    for (const c of valid) {
      const data = {
        full_name: c.full_name || 'Inconnu',
        national_id: c.national_id || '?',
        department_id: c.department_id ? parseInt(c.department_id) : null,
        status: mode === 'worker' ? 'active' : 'pending',
        created_at: new Date().toISOString(),
      };
      if (mode === 'worker') {
        data.position = c.job_info || 'N/A';
        await db.saveWorker(data);
      } else {
        data.job_function = c.job_info || 'Agent';
        await db.saveWeaponHolder(data);
      }
    }
    onImportSuccess(valid.length);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal"
        style={{
          maxWidth: '1100px',
          width: '98%',
          maxHeight: '95vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            borderBottom: '1px solid #eee',
          }}
        >
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FaCamera color="var(--primary)" /> Smart Scan (Pro Debug)
          </h3>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        {/* TABS (NAVIGATION) */}
        <div style={{ display: 'flex', borderBottom: '1px solid #ddd', background: '#f8fafc' }}>
          <button
            onClick={() => setActiveTab('scan')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'scan' ? 'white' : 'transparent',
              fontWeight: activeTab === 'scan' ? 'bold' : 'normal',
              borderBottom: activeTab === 'scan' ? '3px solid var(--primary)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FaImage /> 1. Image & Grille
          </button>
          <button
            onClick={() => setActiveTab('results')}
            disabled={candidates.length === 0}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'results' ? 'white' : 'transparent',
              fontWeight: activeTab === 'results' ? 'bold' : 'normal',
              borderBottom: activeTab === 'results' ? '3px solid var(--primary)' : 'none',
              cursor: candidates.length > 0 ? 'pointer' : 'not-allowed',
              color: candidates.length > 0 ? 'black' : '#ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FaList /> 2. Résultats{' '}
            {candidates.length > 0 && (
              <span
                style={{
                  background: 'var(--primary)',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 6px',
                  fontSize: '0.7rem',
                }}
              >
                {candidates.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB CONTENT: SCANNER */}
        {activeTab === 'scan' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '1rem',
                alignItems: 'center',
              }}
            >
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                <FaCamera /> {image ? 'Changer Image' : 'Charger Image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
              </label>

              <select
                className="input"
                style={{ width: 'auto' }}
                value={docLanguage}
                onChange={(e) => setDocLanguage(e.target.value)}
              >
                <option value="fra">🇫🇷 Français</option>
                <option value="ara">🇩🇿 Arabe</option>
              </select>

              {image && (
                <>
                  <div
                    style={{ width: '1px', height: '20px', background: '#ccc', margin: '0 5px' }}
                  ></div>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setVLines([...vLines, 0.5])}
                  >
                    + Col
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setHLines([...hLines, 0.5])}
                  >
                    + Ligne
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setVLines([0.25, 0.5, 0.75]);
                      setHLines([]);
                    }}
                    style={{ color: 'red' }}
                  >
                    Reset
                  </button>

                  <label
                    className="btn btn-sm"
                    style={{
                      border: '1px solid #f59e0b',
                      color: '#f59e0b',
                      background: debugMode ? '#fef3c7' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: '5px',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={debugMode}
                      onChange={(e) => setDebugMode(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <FaBug /> Debug
                  </label>

                  {!isProcessing && (
                    <button
                      onClick={runOCR}
                      className="btn btn-success btn-sm"
                      style={{ marginLeft: 'auto', fontWeight: 'bold' }}
                    >
                      <FaMagic /> GO
                    </button>
                  )}
                </>
              )}
            </div>

            {/* CANVAS EDITOR */}
            {image && (
              <div
                style={{
                  position: 'relative',
                  overflowX: 'auto',
                  border: '1px solid #ccc',
                  background: '#333',
                }}
              >
                {/* Debug Canvas */}
                <canvas
                  ref={canvasRef}
                  style={{ display: debugMode ? 'block' : 'none', width: '100%', maxWidth: '100%' }}
                />

                {/* Interactive Editor */}
      {/* Interactive Editor with Scroll Gutter */}
<div
  style={{
    position: 'relative',
    minWidth: '600px',
    display: debugMode ? 'none' : 'block',
    // We remove touchAction: 'none' from here so the gutter can work
  }}
>
  {/* 1. SCROLL GUTTER (The "Big Thing" on the right) */}
  <div
    style={{
      position: 'absolute',
      top: 0,
      right: 0,
      width: '50px', // Large enough to grab with a thumb
      height: '100%',
      zIndex: 60, // Above everything
      background: 'rgba(0, 0, 0, 0.1)',
      borderLeft: '2px solid rgba(0, 0, 0, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      touchAction: 'pan-y', // FORCES native scrolling in this zone
      pointerEvents: 'auto',
    }}
  >
    <div style={{ 
      color: '#666', 
      writingMode: 'vertical-rl', 
      textOrientation: 'mixed',
      fontSize: '0.7rem',
      fontWeight: 'bold',
      letterSpacing: '2px'
    }}>
      GLISSER POUR DÉFILER ↕
    </div>
  </div>

  {/* 2. HEADER SELECTORS */}
  <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, right: '50px', height: '30px', zIndex: 30 }}>
    {(() => {
      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
      return sortedV.slice(0, -1).map((x, i) => (
        <div key={i} style={{ position: 'absolute', left: `${x * 100}%`, width: `${(sortedV[i + 1] - x) * 100}%`, textAlign: 'center' }}>
          <select
            className="input"
            style={{ fontSize: '0.7rem', padding: 0, height: '24px', width: '90%', background: 'rgba(255,255,255,0.9)' }}
            value={colMapping[i] || 'ignore'}
            onChange={(e) => {
              const n = [...colMapping];
              n[i] = e.target.value;
              setColMapping(n);
            }}
          >
            {colOptions.map((o) => (
              <option key={o.val} value={o.val}>{o.label}</option>
            ))}
          </select>
        </div>
      ));
    })()}
  </div>

  {/* 3. MAIN IMAGE */}
  <img 
    ref={imageRef} 
    src={image} 
    style={{ 
      display: 'block', 
      width: '100%', 
      marginTop: '30px',
      touchAction: 'none' // Only the image prevents scrolling to protect line movement
    }} 
    alt="Scan" 
  />

  {/* 4. VERTICAL HANDLES (CENTERED - BLUE) */}
  {vLines.map((x, i) => (
    <div key={`v-${i}`} style={{ position: 'absolute', top: 30, bottom: 0, left: `${x * 100}%`, width: '2px', background: '#3b82f6', zIndex: 40 }}>
      <div
        style={{
          position: 'absolute', top: '50%', left: '-16px', transform: 'translateY(-50%)',
          width: '32px', height: '32px', background: '#3b82f6', color: 'white',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
          touchAction: 'none'
        }}
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const rect = e.currentTarget.parentElement.parentElement.getBoundingClientRect();
          const nx = (e.clientX - rect.left) / (rect.width - 50);
          const nv = [...vLines];
          nv[i] = Math.max(0, Math.min(1, nx));
          setVLines(nv.sort((a, b) => a - b)); // Auto-sort fix
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      ><FaArrowsAltH size={12}/></div>
    </div>
  ))}

  {/* 5. HORIZONTAL HANDLES (CENTERED - RED) */}
  {hLines.map((y, i) => (
    <div key={`h-${i}`} style={{ position: 'absolute', left: 0, right: '50px', top: `calc(${y * 100}% + 30px)`, height: '2px', background: '#ef4444', zIndex: 40 }}>
      <div
        style={{
          position: 'absolute', left: '50%', top: '-16px', transform: 'translateX(-50%)',
          width: '32px', height: '32px', background: '#ef4444', color: 'white',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
          touchAction: 'none'
        }}
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const rect = e.currentTarget.parentElement.parentElement.getBoundingClientRect();
          const ny = (e.clientY - rect.top - 30) / (rect.height - 30);
          const nh = [...hLines];
          nh[i] = Math.max(0, Math.min(1, ny));
          setHLines(nh.sort((a, b) => a - b)); // Auto-sort fix
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        onDoubleClick={() => setHLines(hLines.filter((_, idx) => idx !== i))}
      ><FaArrowsAltV size={12}/></div>
    </div>
  ))}
</div>
              </div>
            )}

            {/* Progress */}
            {isProcessing && (
              <div
                style={{
                  marginTop: '1rem',
                  background: '#e0f2fe',
                  padding: '10px',
                  borderRadius: '4px',
                  color: '#0369a1',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}
                >
                  <span>
                    <FaSpinner className="spin" /> {statusText}
                  </span>{' '}
                  <b>{progress}%</b>
                </div>
                <div style={{ height: '6px', background: '#bae6fd', borderRadius: '3px' }}>
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: '#0284c7',
                      borderRadius: '3px',
                      transition: 'width 0.2s',
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Logs - FULL SCROLLABLE */}
            {logs.length > 0 && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px',
                  background: '#1e293b',
                  color: '#94a3b8',
                  fontSize: '0.7rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '5px',
                    borderBottom: '1px solid #334155',
                    paddingBottom: '5px',
                  }}
                >
                  <b>Console OCR</b>
                  <button
                    onClick={() => navigator.clipboard.writeText(logs.join('\n'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <FaClipboardList />
                  </button>
                </div>
                {logs.map((l, i) => (
                  <div key={i} style={{ marginBottom: '2px' }}>
                    {l}
                  </div>
                ))}
              </div>
            )}

            {/* TRACE GALLERY (DEBUG CROPS) */}
            {debugCrops.length > 0 && (
              <div style={{ marginTop: '20px', borderTop: '2px solid #ddd', paddingTop: '10px' }}>
                <h4 style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '10px' }}>
                  <FaEye /> Traces des cellules découpées (Debug)
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '10px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    padding: '5px',
                    background: '#f1f5f9',
                    borderRadius: '8px',
                  }}
                >
                  {debugCrops.map((crop, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'white',
                        padding: '5px',
                        borderRadius: '4px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    >
                      <img
                        src={crop.url}
                        style={{ width: '100%', height: 'auto', border: '1px solid #eee' }}
                        alt="crop"
                      />
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#94a3b8',
                          marginTop: '3px',
                          textAlign: 'center',
                        }}
                      >
                        {crop.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: RESULTS TABLE */}
        {activeTab === 'results' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    background: 'white',
                    zIndex: 10,
                    borderBottom: '2px solid #eee',
                  }}
                >
                  <tr style={{ color: '#64748b' }}>
                    <th style={{ padding: '10px' }}>Matricule</th>
                    <th style={{ padding: '10px' }}>Nom</th>
                    <th style={{ padding: '10px' }}>Service</th>
                    <th style={{ padding: '10px' }}>{mode === 'worker' ? 'Poste' : 'Grade'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px' }}>
                        <input
                          className="input"
                          value={c.national_id}
                          onChange={(e) => updateCandidate(c.id, 'national_id', e.target.value)}
                          style={{ width: '80px', fontFamily: 'monospace' }}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input
                          className="input"
                          value={c.full_name}
                          onChange={(e) => updateCandidate(c.id, 'full_name', e.target.value)}
                          style={{ fontWeight: 'bold' }}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <select
                          className="input"
                          value={c.department_id}
                          onChange={(e) => updateCandidate(c.id, 'department_id', e.target.value)}
                        >
                          <option value="">-</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input
                          className="input"
                          value={c.job_info}
                          onChange={(e) => updateCandidate(c.id, 'job_info', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button
                          onClick={() => removeCandidate(c.id)}
                          style={{ color: 'red', background: 'none', border: 'none' }}
                        >
                          <FaTimes />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FOOTER */}
        {activeTab === 'results' && candidates.length > 0 && (
          <div
            style={{
              padding: '1rem',
              borderTop: '1px solid #eee',
              background: 'white',
              textAlign: 'right',
            }}
          >
            <button
              onClick={handleBulkImport}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              <FaSave /> Sauvegarder {candidates.length} fiches
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
