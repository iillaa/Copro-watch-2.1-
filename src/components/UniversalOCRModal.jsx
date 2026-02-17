import { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

// 1. MATCH YOUR VERSION (Change 1.19.0 to whatever 'npm list' showed)
const ORT_VERSION = '1.24.1'; 
const CDN_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

// 2. FORCE PATHS BEFORE THE LIBRARY LOADS
ort.env.wasm.wasmPaths = CDN_URL;
// This tells the engine to use the main thread to fetch WASM, 
// which avoids the "Worker 404" problem.
ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = 1;
window.ort = ort; 

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

// --- ALG-FR TRANSLITERATION ENGINE (RESTORED) ---
const transliterateArToFr = (text) => {
  if (!text) return '';
  const map = {
    ا: 'A', أ: 'A', إ: 'E', آ: 'A', ى: 'A', ة: 'A',
    ب: 'B', ت: 'T', ث: 'T', ج: 'DJ', ح: 'H', خ: 'KH',
    د: 'D', ذ: 'D', ر: 'R', ز: 'Z', س: 'S', ش: 'CH',
    ص: 'S', ض: 'D', ط: 'T', ظ: 'Z', ع: 'A', غ: 'GH',
    ف: 'F', ق: 'K', ك: 'K', ل: 'L', م: 'M', ن: 'N',
    ه: 'H', و: 'OU', ي: 'Y', ' ': ' ', '-': '-', '.': '.',
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
  const [debugCrops, setDebugCrops] = useState([]);
  
  // NEW: Engine State
  const [ocrEngine, setOcrEngine] = useState('tesseract'); // 'tesseract' or 'paddle'

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

  // ========== IMAGE LOADING (RESTORED EXACTLY) ==========
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

  // ========== TESSERACT HELPER (RESTORED EXACTLY) ==========
  const getCellImage = (imgElement, rect, paddingY = 15, paddingX = 8) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // FIX 1: Increase Scale to 4x (Critical for separating Arabic words)
    const scale = 4;
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

    // FIX 2: Hard Threshold (175) - Makes text solid black, background solid white.
    const threshold = 175;

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      let v = gray < threshold ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png'); 
  };

  // ========== VISUAL DEBUGGER (RESTORED) ==========
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

  // ========== ENGINE 1: TESSERACT (RENAMED FROM runOCR) ==========
  const runTesseractOCR = async () => {
    if (!image || !imageRef.current) return;
    if (debugMode) {
      drawDebugGrid();
      return;
    }

    setLogs([]);
    setDebugCrops([]);
    setIsProcessing(true);
    setCandidates([]);
    setProgress(0);
    setStatusText('Tesseract (Local)...');

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
          const colIndex = isRTL ? sortedV.length - 2 - c : c;
          const field = colMapping[colIndex];

          if (!field || field === 'ignore') {
            cellsProcessed++;
            continue;
          }

          const rawW = (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width;
          const rawH = (sortedH[r + 1] - sortedH[r]) * imgDimensions.height;
          const safetyMargin = 10;

          const cropParams = {
            x: sortedV[colIndex] * imgDimensions.width + safetyMargin,
            y: sortedH[r] * imgDimensions.height + safetyMargin,
            width: rawW - safetyMargin * 2,
            height: rawH - safetyMargin * 2,
          };

          if (cropParams.width < 10 || cropParams.height < 10) continue;

          // Conditional Parameters
          if (field === 'national_id') {
            await worker.setParameters({
              tessedit_pageseg_mode: '7',
              preserve_interword_spaces: '1',
              tessedit_char_whitelist:
                '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-. ',
            });
          } else {
            await worker.setParameters({
              tessedit_pageseg_mode: '7',
              preserve_interword_spaces: '1',
              tessedit_char_whitelist: '', // Allow Arabic
            });
          }

          // Generate URL
          const cellUrl = getCellImage(imageRef.current, cropParams, 5, 0);

          // Debug Trace
          setDebugCrops((prev) => [...prev, { label: `R${r + 1}C${c + 1}`, url: cellUrl }]);

          const {
            data: { text, confidence },
          } = await worker.recognize(cellUrl);

          let cleanText = text.trim().replace(/^[\s|I_\-.]+|[\s|I_\-.]+$/g, '');

          // NOISE FILTER
          if (isRTL && cleanText.length < 3 && /^[a-zA-Z\s|]+$/.test(cleanText)) {
            addLog(`[FILTER] Ignored noise "${cleanText}" in ${field}`);
            cleanText = '';
          }

          addLog(`[CELL] R${r + 1}C${c + 1} (${field}): "${cleanText}" | ${confidence}%`);

          if (cleanText) {
            candidate[field] = cleanText;
            hasDataInRow = true;
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
      if (results.length > 0) setActiveTab('results');
    } catch (err) {
      addLog(`[CRASH] ${err.message}`);
    } finally {
      if (worker) await worker.terminate();
      setIsProcessing(false);
    }
  };

  // ========== ENGINE 2: PADDLE OCR (NEW TURBO MODE) ==========
  // SURGICAL FIX: Using Raw Pixel Data (ImageData) instead of HTML Element
  // This bypasses the decoding step in WASM which fails on Android WebView
const runPaddleOCR = async () => {
  if (!image || !imageRef.current) return;
  setIsProcessing(true);
  setLogs([]);
  addLog(`[PADDLE] Initialisation IA v${ORT_VERSION}...`);
  setProgress(10);
  setStatusText('Paddle AI (Turbo)...');

  try {
    const img = imageRef.current;
    
    // 1. DIMENSIONS & ASPECT RATIO (Multiple of 32)
    // We must preserve aspect ratio to ensure accurate text detection
    const MAX_DIM = 960;
    const ratio = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight, 1);
    const finalW = Math.floor((img.naturalWidth * ratio) / 32) * 32;
    const finalH = Math.floor((img.naturalHeight * ratio) / 32) * 32;

    // 2. DRAW TO CANVAS
    const canvas = document.createElement('canvas');
    canvas.width = finalW;
    canvas.height = finalH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, finalW, finalH);
    ctx.drawImage(img, 0, 0, finalW, finalH);

    // 3. SURGICAL FIX: DATA URL (BASE64)
    // We pass a Base64 JPEG string which is universally supported by the engine
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    addLog(`[PADDLE] Image optimisée: ${finalW}x${finalH}px (Original: ${img.naturalWidth}x${img.naturalHeight})`);

    // 4. VISUAL DEBUG (If enabled)
    if (debugMode && canvasRef.current) {
      const debugCtx = canvasRef.current.getContext('2d');
      canvasRef.current.width = finalW;
      canvasRef.current.height = finalH;
      debugCtx.drawImage(canvas, 0, 0);
      debugCtx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
      debugCtx.lineWidth = 2;
      addLog('[DEBUG] Image source affichée.');
    }

    // 5. LOAD ENGINE (Absolute Paths)
    // 6. LOAD ENGINE (Absolute Paths)
    const baseUrl = window.location.origin + window.location.pathname.split('/').slice(0, -1).join('/') + '/';
    const modelsUrl = baseUrl + 'models/';

    const ocr = await Ocr.create({
      models: {
        detectionPath: `${modelsUrl}det.onnx`,
        recognitionPath: `${modelsUrl}rec_ara.onnx`,
        dictionaryPath: `${modelsUrl}keys_ara.txt`
      }
    });

    addLog('[PADDLE] Moteur prêt. Lecture globale...');
    setProgress(40);

    // 7. DETECTION (Passing Base64 Data URL)
    const results = await ocr.detect(dataUrl);
    
    setProgress(80);
    addLog(`[PADDLE] Succès: ${results.length} éléments textuels détectés.`);

    // 8. COORDINATE MAPPING & DEBUG
    const ratioX = imgDimensions.width / finalW;
    const ratioY = imgDimensions.height / finalH;

    // Debug overlay on canvas
    if (debugMode && canvasRef.current) {
      const debugCtx = canvasRef.current.getContext('2d');

      // Draw detected boxes
      results.forEach(item => {
        debugCtx.beginPath();
        debugCtx.moveTo(item.box[0][0], item.box[0][1]);
        debugCtx.lineTo(item.box[1][0], item.box[1][1]);
        debugCtx.lineTo(item.box[2][0], item.box[2][1]);
        debugCtx.lineTo(item.box[3][0], item.box[3][1]);
        debugCtx.closePath();
        debugCtx.stroke();
      });

      // Draw grid lines (mapped to current canvas size)
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;

      debugCtx.strokeStyle = 'blue';
      vLines.forEach(v => {
        debugCtx.beginPath();
        debugCtx.moveTo(v * w, 0);
        debugCtx.lineTo(v * w, h);
        debugCtx.stroke();
      });

      debugCtx.strokeStyle = 'red';
      hLines.forEach(y => {
        debugCtx.beginPath();
        debugCtx.moveTo(0, y * h);
        debugCtx.lineTo(w, y * h);
        debugCtx.stroke();
      });
    }

    const adaptedWords = results.map(item => ({
      text: item.text,
      // Centroid Calculation
      cx: ((item.box[0][0] + item.box[2][0]) / 2) * ratioX,
      cy: ((item.box[0][1] + item.box[2][1]) / 2) * ratioY,
      // Bounding Box (Scaled)
      minX: Math.min(item.box[0][0], item.box[3][0]) * ratioX,
      maxX: Math.max(item.box[1][0], item.box[2][0]) * ratioX,
      minY: Math.min(item.box[0][1], item.box[1][1]) * ratioY,
      maxY: Math.max(item.box[2][1], item.box[3][1]) * ratioY,
    }));

    // 9. GRID SORTING & DEBUG CROPS
    setDebugCrops([]); // Clear previous
    const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
    const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
    const isRTL = docLanguage === 'ara';
    const gridCandidates = [];
    const newDebugCrops = [];

    for (let r = 0; r < sortedH.length - 1; r++) {
      let candidate = createEmptyCandidate();
      let hasData = false;
      const yTop = sortedH[r] * imgDimensions.height;
      const yBottom = sortedH[r + 1] * imgDimensions.height;

      for (let c = 0; c < sortedV.length - 1; c++) {
        const colIndex = isRTL ? sortedV.length - 2 - c : c;
        const field = colMapping[colIndex];
        if (!field || field === 'ignore') continue;

        const xLeft = sortedV[colIndex] * imgDimensions.width;
        const xRight = sortedV[colIndex + 1] * imgDimensions.width;

        // HEURISTIC: Find words that overlap with this cell
        // 1. Text centroid falls inside cell (Normal case)
        // 2. OR Text box overlaps significantly (Cross-column case - split needed)

        let cellTextParts = [];

        adaptedWords.forEach(w => {
           // Vertical Check: Must be in this row
           if (w.cy < yTop || w.cy > yBottom) return;

           // Horizontal Check: Overlap Logic
           const overlapStart = Math.max(w.minX, xLeft);
           const overlapEnd = Math.min(w.maxX, xRight);
           const overlapWidth = Math.max(0, overlapEnd - overlapStart);
           const wordWidth = w.maxX - w.minX;

           // If overlap is significant (> 30% of word or > 80% of cell)
           if (overlapWidth > 0 && wordWidth > 0) {
              const overlapRatio = overlapWidth / wordWidth;

              if (overlapRatio > 0.9) {
                 // Entire word is in this cell
                 cellTextParts.push({ text: w.text, x: w.minX });
              } else if (overlapRatio > 0.2) {
                 // PARTIAL OVERLAP: Attempt to slice text proportional to width
                 // This handles "Name Surname" spanning two columns
                 const len = w.text.length;
                 const startRatio = (overlapStart - w.minX) / wordWidth;
                 const endRatio = (overlapEnd - w.minX) / wordWidth;

                 const startIdx = Math.floor(startRatio * len);
                 const endIdx = Math.ceil(endRatio * len);

                 const slicedText = w.text.substring(startIdx, endIdx).trim();
                 if (slicedText.length > 0) {
                    cellTextParts.push({ text: slicedText, x: overlapStart });
                    // Visual Debug for splitting
                    if (debugMode) {
                        addLog(`[SPLIT] "${w.text}" -> "${slicedText}" for ${field}`);
                    }
                 }
              }
           }
        });

        if (cellTextParts.length > 0) {
          // Sort words logically (RTL or LTR)
          cellTextParts.sort((a, b) => isRTL ? b.x - a.x : a.x - b.x);
          const finalText = cellTextParts.map(p => p.text).join(' ');

          candidate[field] = finalText;
          hasData = true;

          addLog(`[CELL] R${r+1}C${c+1} (${field}): "${finalText}"`);

          // Create Debug Crop (visualize what fell into this bucket)
          if (debugMode) {
             const cropW = xRight - xLeft;
             const cropH = yBottom - yTop;
             const cropUrl = getCellImage(imageRef.current, {
               x: xLeft, y: yTop, width: cropW, height: cropH
             }, 0, 0);

             newDebugCrops.push({
               label: `R${r+1}C${c+1}: ${finalText.substring(0, 10)}...`,
               url: cropUrl
             });
          }
        } else {
           addLog(`[CELL] R${r+1}C${c+1} (${field}): - Vide -`);
        }
      }
      if (hasData) {
        cleanCandidate(candidate);
        gridCandidates.push(candidate);
      }
    }

    setDebugCrops(newDebugCrops);
    setCandidates(gridCandidates);

    // Only switch tabs if not debugging, so user can see the overlay
    if (!debugMode) {
        setActiveTab('results');
    } else {
        addLog('[DEBUG] Mode Debug actif: Resté sur l\'onglet Scan pour visualisation.');
    }

  } catch (e) {
    addLog(`[ERREUR] ${e.message}`);
    console.error(e);
  } finally {
    setIsProcessing(false);
    setProgress(100);
  }
};
  // --- MASTER SWITCH ---
  const handleGo = () => {
    if (ocrEngine === 'paddle') {
      runPaddleOCR();
    } else {
      runTesseractOCR();
    }
  };

  // --- HELPERS (RESTORED) ---
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
            <FaCamera color="var(--primary)" /> Smart Scan (Hybrid Pro)
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

                  {/* NEW: ENGINE TOGGLE */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
                    <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '6px', padding: '2px' }}>
                        <button onClick={() => setOcrEngine('tesseract')} style={{ background: ocrEngine === 'tesseract' ? 'white' : 'transparent', color: ocrEngine === 'tesseract' ? '#0f172a' : '#64748b', border: '1px solid transparent', borderColor: ocrEngine === 'tesseract' ? '#cbd5e1' : 'transparent', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
                          Safe
                        </button>
                        <button onClick={() => setOcrEngine('paddle')} style={{ background: ocrEngine === 'paddle' ? 'var(--primary)' : 'transparent', color: ocrEngine === 'paddle' ? 'white' : '#64748b', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
                          Turbo AI
                        </button>
                    </div>

                    {!isProcessing && (
                      <button onClick={handleGo} className="btn btn-success btn-sm" style={{ fontWeight: 'bold' }}>
                        <FaMagic /> GO
                      </button>
                    )}
                  </div>
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
                {/* Debug Canvas (RESTORED VISIBILITY) */}
                <canvas
                  ref={canvasRef}
                  style={{ display: debugMode ? 'block' : 'none', width: '100%', maxWidth: '100%' }}
                />

                {/* Interactive Editor with Scroll Gutter */}
                <div
                  style={{
                    position: 'relative',
                    minWidth: '600px',
                    display: debugMode ? 'none' : 'block',
                  }}
                >
                  {/* SCROLL GUTTER */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: '50px',
                      height: '100%',
                      zIndex: 60,
                      background: 'rgba(0, 0, 0, 0.1)',
                      borderLeft: '2px solid rgba(0, 0, 0, 0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      touchAction: 'pan-y',
                      pointerEvents: 'auto',
                    }}
                  >
                    <div
                      style={{
                        color: '#666',
                        writingMode: 'vertical-rl',
                        textOrientation: 'mixed',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        letterSpacing: '2px',
                      }}
                    >
                      SCROLL ↕
                    </div>
                  </div>

                  {/* HEADER SELECTORS */}
                  <div
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: '50px',
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
                              width: '90%',
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

                  {/* MAIN IMAGE */}
                  <img
                    ref={imageRef}
                    src={image}
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: '30px',
                      touchAction: 'pan-y',
                    }}
                    alt="Scan"
                  />

                  {/* VERTICAL HANDLES */}
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
                        zIndex: 40,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '-16px',
                          transform: 'translateY(-50%)',
                          width: '32px',
                          height: '32px',
                          background: '#3b82f6',
                          color: 'white',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                          touchAction: 'none',
                        }}
                        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                        onPointerMove={(e) => {
                          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                          const rect =
                            e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                          const nx = (e.clientX - rect.left) / (rect.width - 50);
                          const nv = [...vLines];
                          nv[i] = Math.max(0, Math.min(1, nx));
                          setVLines(nv.sort((a, b) => a - b));
                        }}
                        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                      >
                        <FaArrowsAltH size={12} />
                      </div>
                    </div>
                  ))}

                  {/* HORIZONTAL HANDLES */}
                  {hLines.map((y, i) => (
                    <div
                      key={`h-${i}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: '50px',
                        top: `calc(${y * 100}% + 30px)`,
                        height: '2px',
                        background: '#ef4444',
                        zIndex: 40,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '-16px',
                          transform: 'translateX(-50%)',
                          width: '32px',
                          height: '32px',
                          background: '#ef4444',
                          color: 'white',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                          touchAction: 'none',
                        }}
                        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                        onPointerMove={(e) => {
                          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                          const rect =
                            e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                          const ny = (e.clientY - rect.top - 30) / (rect.height - 30);
                          const nh = [...hLines];
                          nh[i] = Math.max(0, Math.min(1, ny));
                          setHLines(nh.sort((a, b) => a - b));
                        }}
                        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                        onDoubleClick={() => setHLines(hLines.filter((_, idx) => idx !== i))}
                      >
                        <FaArrowsAltV size={12} />
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

            {/* Logs */}
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

            {/* TRACE GALLERY (DEBUG CROPS RESTORED) */}
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