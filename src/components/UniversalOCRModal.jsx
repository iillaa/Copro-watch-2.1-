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
const getCellImage = (imgElement, rect, padding = 15) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Define dimensions including padding
  const targetW = rect.width + padding * 2;
  const targetH = rect.height + padding * 2;
  canvas.width = targetW;
  canvas.height = targetH;

  // Fill background white to ensure padding doesn't create black bars
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);

  // Draw the specific crop from the source image into the padded center
  ctx.drawImage(
    imgElement,
    rect.x, rect.y, rect.width, rect.height, // Source
    padding, padding, rect.width, rect.height // Destination
  );

  return canvas.toDataURL('image/jpeg', 0.9);
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
 const runOCR = async () => {
  if (!image || !imageRef.current) return;
  setLogs([]);
  setDebugCrops([]); // Clear previous traces
  addLog('🚀 ========== GRID-FIRST OCR START ==========');
  
  setIsProcessing(true);
  setCandidates([]);
  setProgress(0);
  setStatusText('Initialisation Tesseract...');

  let worker = null;
  try {
    const langs = docLanguage === 'ara' ? 'ara+fra' : 'fra';
    worker = await Tesseract.createWorker(langs, 1);
    
    // Set PSM 7: Treats each crop as a single line of text
    await worker.setParameters({
      tessedit_pageseg_mode: '7',
      preserve_interword_spaces: '1',
    });

    const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
    const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
    const results = [];
    
    const totalCells = (sortedH.length - 1) * (sortedV.length - 1);
    let cellsProcessed = 0;

    for (let r = 0; r < sortedH.length - 1; r++) {
      let candidate = createEmptyCandidate(); //
      let hasDataInRow = false;

      for (let c = 0; c < sortedV.length - 1; c++) {
        const field = colMapping[c]; //
        
        // Skip ignored columns or tiny rows
        if (!field || field === 'ignore') {
          cellsProcessed++;
          continue;
        }

        const yCoord = sortedH[r] * imgDimensions.height;
        const xCoord = sortedV[c] * imgDimensions.width;
        const cellW = (sortedV[c + 1] - sortedV[c]) * imgDimensions.width;
        const cellH = (sortedH[r + 1] - sortedH[r]) * imgDimensions.height;

        if (cellH < 15) continue; // Minimum height threshold

        setStatusText(`Scan: Ligne ${r + 1}, Col ${c + 1}...`);
        
        // Create the crop with 15px padding
        const cellDataURL = getCellImage(imageRef.current, {
          x: xCoord,
          y: yCoord,
          width: cellW,
          height: cellH
        }, 15);

        // Save trace for the debug section
        setDebugCrops(prev => [...prev, {
          label: `R${r+1} C${c+1} (${field})`,
          url: cellDataURL
        }]);

        // Targeted recognition
        const { data: { text } } = await worker.recognize(cellDataURL);
        const cleanText = text.replace(/[|\[\]{};:*!@#$%^&()]/g, '').trim().toUpperCase();

        if (cleanText) {
          candidate[field] = cleanText;
          hasDataInRow = true;
        }

        cellsProcessed++;
        setProgress(Math.round((cellsProcessed / totalCells) * 100));
      }

      if (hasDataInRow) {
        cleanCandidate(candidate); //
        results.push(candidate);
        addLog(`[OK] Ligne ${r + 1} traitée: ${candidate.full_name || 'Sans Nom'}`);
      }
    }

    setCandidates(results);
    if (results.length > 0) {
      addLog(`[SUCCESS] ${results.length} fiches extraites via la grille.`);
      setActiveTab('results');
    }
  } catch (err) {
    addLog(`[CRASH] ${err.message}`);
    alert(`Erreur OCR: ${err.message}`);
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
                <div
                  style={{
                    position: 'relative',
                    minWidth: '600px',
                    display: debugMode ? 'none' : 'block',
                  }}
                >
                  {/* Col Headers */}
                  <div
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '30px',
                      zIndex: 30,
                    }}
                  >
                    {(() => {
                      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
                      return sortedV.slice(0, -1).map((x, i) => (
                        <div
                          key={i}
                          style={{
                            position: 'absolute',
                            left: `${x * 100}%`,
                            width: `${(sortedV[i + 1] - x) * 100}%`,
                            textAlign: 'center',
                          }}
                        >
                          <select
                            className="input"
                            style={{
                              fontSize: '0.7rem',
                              padding: 0,
                              height: '24px',
                              width: '95%',
                              background: 'rgba(255,255,255,0.9)',
                            }}
                            value={colMapping[i] || 'ignore'}
                            onChange={(e) => {
                              const n = [...colMapping];
                              n[i] = e.target.value;
                              setColMapping(n);
                            }}
                          >
                            {colOptions.map((o) => (
                              <option key={o.val} value={o.val}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ));
                    })()}
                  </div>

                  <img
                    ref={imageRef}
                    src={image}
                    style={{ display: 'block', width: '100%', marginTop: '30px' }}
                    alt="Scan"
                  />

                  {/* Lines Overlay */}
                  {vLines.map((x, i) => (
                    <div
                      key={`v-${i}`}
                      style={{
                        position: 'absolute',
                        top: 30,
                        bottom: 0,
                        left: `${x * 100}%`,
                        width: '2px',
                        background: '#3b82f6',
                        zIndex: 20,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '-15px',
                          left: '-10px',
                          width: '20px',
                          height: '20px',
                          background: '#3b82f6',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          cursor: 'col-resize',
                        }}
                        onTouchMove={(e) => {
                          const rect =
                            e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                          const nx = (e.touches[0].clientX - rect.left) / rect.width;
                          const nv = [...vLines];
                          nv[i] = Math.max(0, Math.min(1, nx));
                          setVLines(nv);
                        }}
                      >
                        <FaArrowsAltH size={10} />
                      </div>
                    </div>
                  ))}
                  {hLines.map((y, i) => (
                    <div
                      key={`h-${i}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `calc(${y * 100}% + 30px)`,
                        height: '2px',
                        background: '#ef4444',
                        zIndex: 20,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          right: '0',
                          top: '-10px',
                          width: '20px',
                          height: '20px',
                          background: '#ef4444',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          cursor: 'row-resize',
                        }}
                        onTouchMove={(e) => {
                          const rect =
                            e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                          const imgH = rect.height - 30;
                          const ny = (e.touches[0].clientY - rect.top - 30) / imgH;
                          const nh = [...hLines];
                          nh[i] = Math.max(0, Math.min(1, ny));
                          setHLines(nh);
                        }}
                        onDoubleClick={() => setHLines(hLines.filter((_, idx) => idx !== i))}
                      >
                        <FaArrowsAltV size={10} />
                      </div>
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
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
                  gap: '10px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  padding: '5px',
                  background: '#f1f5f9',
                  borderRadius: '8px'
                }}>
                  {debugCrops.map((crop, idx) => (
                    <div key={idx} style={{ background: 'white', padding: '5px', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <img src={crop.url} style={{ width: '100%', height: 'auto', border: '1px solid #eee' }} alt="crop" />
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px', textAlign: 'center' }}>
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
