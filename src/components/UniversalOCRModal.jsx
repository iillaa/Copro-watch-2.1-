import { useState, useRef, useEffect } from 'react';
// [FIX] Removed import Tesseract and ORT to use global window objects for true isolation from Vite
import Ocr from '@gutenye/ocr-browser';

// --- [CRITICAL] GLOBAL OCR ENGINE CONFIGURATION (ELITE PERFORMANCE) ---
if (typeof window !== 'undefined') {
  const setupOrt = () => {
    const ort = window.ort;
    if (!ort) return;

    // 1. Detect Environment
    const isAndroid = /Android/i.test(navigator.userAgent) || (window.Capacitor && window.Capacitor.getPlatform() === 'android');
    const isChrome = /Chrome/i.test(navigator.userAgent);
    const chromeVersion = isChrome ? parseInt(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || '0') : 999;
    const isOldBrowser = isChrome && chromeVersion < 91;

    // 2. Performance Rules (ELITE)
    ort.env.wasm.proxy = false;
    // Enable Multi-threading
    ort.env.wasm.numThreads = Math.min(4, window.navigator.hardwareConcurrency || 2);
    // Enable SIMD (The Opcode 0xfd thing)
    ort.env.wasm.simd = true; 

    if (isOldBrowser && !isAndroid) {
      console.warn('[COMPAT] Old Browser detected (Chrome ' + chromeVersion + '). SIMD may crash.');
    }

    ort.env.wasm.wasmPaths = './'; 
    ort.env.wasm.logging = { warning: () => {} };
    window.ort = ort;
    console.log('[OCR_CONFIG] Elite 1.24.1 Initialized. SIMD=ON, Threads=' + ort.env.wasm.numThreads);
  };

  if (window.ort) setupOrt();
  else setTimeout(setupOrt, 500);
}

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
  FaLightbulb,
  FaTrash,
  FaUsers /* [FIX] Added missing icon */,
} from 'react-icons/fa';

// --- ALG-FR TRANSLITERATION ENGINE (SMART DICTIONARY + PHONETIC) ---
const transliterateArToFr = (text) => {
  if (!text) return '';
  try {
    const customDict = JSON.parse(
      localStorage.getItem('ocr_smart_dict') || '{"national_id":{},"full_name":{},"job_info":{}}'
    );
    const rawKey = text.replace(/\s+/g, '');
    if (customDict.full_name && customDict.full_name[rawKey]) return customDict.full_name[rawKey];
  } catch (e) {}

  let processedText = text;
  const commonNames = {
    عبد: 'Abdel ',
    'بن ': 'Ben ',
    بو: 'Bou ',
    محمد: 'Mohamed ',
    فاطمة: 'Fatima ',
    صالح: 'Salah ',
    فضيلة: 'Fadila ',
    دونية: 'Dounia ',
    احمد: 'Ahmed ',
    علي: 'Ali ',
    عمر: 'Omar ',
    خديجة: 'Khadidja ',
    عائشة: 'Aicha ',
    ابراهيم: 'Brahim ',
    حسين: 'Hocine ',
    حسن: 'Hassan ',
    سعيد: 'Said ',
    كريم: 'Karim ',
    امين: 'Amine ',
    الدين: ' Eddine ',
    نور: 'Nour ',
    عبدال: 'Abdel ',
    ال: 'El ',
  };
  for (const [ar, fr] of Object.entries(commonNames)) {
    processedText = processedText.replace(new RegExp(ar, 'g'), fr);
  }
  const map = {
    ا: 'a',
    أ: 'a',
    إ: 'i',
    آ: 'a',
    ى: 'a',
    ة: 'a',
    ب: 'b',
    ت: 't',
    ث: 't',
    ج: 'dj',
    ح: 'h',
    خ: 'kh',
    د: 'd',
    ذ: 'd',
    ر: 'r',
    ز: 'z',
    س: 's',
    ش: 'ch',
    ص: 's',
    ض: 'd',
    ط: 't',
    ظ: 'z',
    ع: 'a',
    غ: 'gh',
    ف: 'f',
    ق: 'k',
    ك: 'k',
    ل: 'l',
    م: 'm',
    ن: 'n',
    ه: 'h',
    و: 'ou',
    ي: 'i',
  };

  // Helper to check if a char is Arabic (\u0600-\u06FF)
  const isArabicChar = (char) => /[\u0600-\u06FF]/.test(char);

  let lat = '';
  // NEW: Process string character by character to detect script switches
  for (let i = 0; i < processedText.length; i++) {
    const char = processedText[i];
    if (isArabicChar(char)) {
      lat += map[char] || char;
    } else {
      // Latin, digit or space - keep as is
      lat += char;
    }
  }

  lat = lat
    .replace(/oua/g, 'wa')
    .replace(/ouou/g, 'ou')
    .replace(/ii/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
  return lat
    .split(' ')
    .map((word) => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.toLowerCase().slice(1);
    })
    .join(' ');
};

// --- FR-ALG TRANSLITERATION ENGINE (HYBRID DICTIONARY + PHONETIC) ---
const transliterateFrToAr = (text) => {
  if (!text) return '';
  let processed = text.toLowerCase().trim();

  const commonNames = {
    abdel: 'عبد ال',
    ben: 'بن ',
    bou: 'بو ',
    mohamed: 'محمد',
    fatima: 'فاطمة',
    salah: 'صالح',
    fadila: 'فضيلة',
    dounia: 'دونية',
    ahmed: 'أحمد',
    ali: 'علي',
    omar: 'عمر',
    khadidja: 'خديجة',
    aicha: 'عائشة',
    brahim: 'إبراهيم',
    hocine: 'حسين',
    hassan: 'حسن',
    said: 'سعيد',
    karim: 'كريم',
    amine: 'أمين',
    eddine: 'الدين',
    nour: 'نور',
    el: 'ال',
  };
  for (const [fr, ar] of Object.entries(commonNames)) {
    processed = processed.replace(new RegExp('\\b' + fr + '\\b', 'g'), ar);
  }

  const map = {
    a: 'ا',
    b: 'ب',
    c: 'ك',
    d: 'د',
    e: 'ي',
    f: 'ف',
    g: 'ق',
    h: 'ح',
    i: 'ي',
    j: 'ج',
    k: 'ك',
    l: 'ل',
    m: 'م',
    n: 'ن',
    o: 'و',
    p: 'ب',
    q: 'ق',
    r: 'ر',
    s: 'س',
    t: 'ت',
    u: 'و',
    v: 'ف',
    w: 'و',
    x: 'كس',
    y: 'ي',
    z: 'ز',
    ' ': ' ',
  };
  processed = processed
    .replace(/ch/g, 'ش')
    .replace(/kh/g, 'خ')
    .replace(/dj/g, 'ج')
    .replace(/ou/g, 'و')
    .replace(/gh/g, 'غ');
  return processed
    .split('')
    .map((char) => map[char] || char)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
};

// --- SMART ARABIC REVERSAL ---
// Only reverses characters inside Arabic words. Protects Latin text and numbers.
const smartRTLFix = (text) => {
  if (!text) return '';
  return text
    .split(' ')
    .map((word) => {
      // If the specific word contains Arabic, reverse it
      if (/[\u0600-\u06FF]/.test(word)) {
        return word.split('').reverse().join('');
      }
      // If it's a number or French word, leave it completely alone
      return word;
    })
    .join(' ');
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
  const [errorMessage, setErrorMessage] = useState(null);
  const [docLanguage, setDocLanguage] = useState('fra');
  const [debugMode, setDebugMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [debugCrops, setDebugCrops] = useState([]);
  const [debugBoxes, setDebugBoxes] = useState([]);

  // [NEW] Persistent Worker Refs
  const tesseractWorkersRef = useRef([]);
  const tesseractFraWorkersRef = useRef([]); // Dedicated Latin-only pool
  const paddleOcrRef = useRef(null);
  const currentLangsRef = useRef('');
  const currentFraLangsRef = useRef('');

  // NEW: SAFE COMPONENT MOUNT TRACKER (Prevents memory leaks/crashes)
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;

      // [CLEANUP] Revoke Blob URL if exists
      if (image && image.startsWith('blob:')) {
        URL.revokeObjectURL(image);
      }

      // [CLEANUP] Kill workers on unmount
      console.log('[OCR] Cleaning up workers...');
      tesseractWorkersRef.current.forEach((w) => w.terminate());
      tesseractFraWorkersRef.current.forEach((w) => w.terminate());
      if (paddleOcrRef.current && paddleOcrRef.current.dispose) {
        paddleOcrRef.current.dispose();
      }
    };
  }, []);

  // [NEW] Asset URL Helper for Capacitor/Web/Standalone consistency
  const getAssetUrl = (path, isDirectory = false) => {
    // Clean leading/trailing slashes
    let cleanPath = path.replace(/^\/+|\/+$/g, '');

    const isCapacitor = window.Capacitor && window.Capacitor.isNative;
    if (isCapacitor) {
      return cleanPath ? `${window.location.origin}/${cleanPath}` : `${window.location.origin}/`;
    }

    // Always use relative paths for Standalone and regular Web for better portability
    return cleanPath ? `./${cleanPath}` : './';
  };

  const resolveTesseractAssetConfig = async (langs) => {
    const tessRoot = getAssetUrl('/tesseract', true);
    const workerPath = `${tessRoot}/worker.min.js`;
    const corePath = `${tessRoot}/tesseract-core.wasm.js`;

    const checkExists = async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return false;
        // [FIX] Detect if we got an HTML error page instead of binary data
        const ct = res.headers.get('Content-Type') || '';
        if (ct.includes('text/html')) return false;
        return true;
      } catch (e) {
        return false;
      }
    };

    console.log(`[TESS_RESOLVE] Checking assets at: ${tessRoot}`);
    const requiredEngineFiles = [workerPath, corePath];
    for (const fileUrl of requiredEngineFiles) {
      if (!(await checkExists(fileUrl))) {
        console.error(`[TESS_RESOLVE] Missing core file: ${fileUrl}`);
        throw new Error(`Missing local Tesseract file: ${fileUrl}`);
      }
    }

    const requiredLangs = langs.split('+').filter(Boolean);
    const hasRawTrainedData = await Promise.all(
      requiredLangs.map((lang) => checkExists(`${tessRoot}/${lang}.traineddata`))
    );

    const useRawTrainedData = hasRawTrainedData.every(Boolean);
    console.log(`[TESS_RESOLVE] Raw traineddata available: ${useRawTrainedData}`);

    if (!useRawTrainedData) {
      const hasGzTrainedData = await Promise.all(
        requiredLangs.map((lang) => checkExists(`${tessRoot}/${lang}.traineddata.gz`))
      );
      if (!hasGzTrainedData.every(Boolean)) {
        console.error(`[TESS_RESOLVE] Missing .gz data for: ${requiredLangs.join(', ')}`);
        throw new Error(
          `Missing local language data for ${requiredLangs.join(', ')} in ${tessRoot}`
        );
      }
    }

    return {
      workerPath,
      corePath,
      langPath: tessRoot,
      gzip: !useRawTrainedData,
    };
  };

  // [STRATEGY 2]: STRICT ISOLATION & DYNAMIC INITIALIZATION
  useEffect(() => {
    const isAndroid = /Android/i.test(navigator.userAgent) || (window.Capacitor && window.Capacitor.getPlatform() === 'android');
    const ort = window.ort;
    
    if (ort) {
      const performanceMode = ort.env.wasm.simd ? 'PERFORMANCE (SIMD)' : 'SAFE (Non-SIMD)';
      addLog(`[SYSTEM] OS: ${isAndroid ? 'Android' : 'PC/Web'}`);
      addLog(`[SYSTEM] Engine: ${performanceMode}`);
      addLog(`[SYSTEM] Threads: ${ort.env.wasm.numThreads}`);
    } else {
      addLog(`[SYSTEM] Waiting for OCR Engine...`);
    }

    // THE KILL SWITCH
    return () => {
      console.log('Modal closed: Executing Memory Kill Switch...');
      const ort = window.ort;
      // Destroy ONNX Runtime
      if (ort) {
        ort.env.wasm.numThreads = 0;
      }
      // Destroy OpenCV Global
      if (window.cv) {
        window.cv = null;
      }
      console.log('OCR RAM flagged for deletion.');
    };
  }, []);

  // NEW: Engine State
  const [ocrEngine, setOcrEngine] = useState('tesseract'); // 'tesseract' or 'paddle' or 'hybrid'

  // LOGS: Full Array + Scroll
  const [logs, setLogs] = useState([]);
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  // ========== GRID PRESET MANAGER ==========
  const saveGridPreset = () => {
    const name = prompt('Nom du template (ex: Tableau_Resto_V1):');
    if (!name) return;
    const presets = JSON.parse(localStorage.getItem('ocr_grid_presets') || '{}');
    presets[name] = { vLines, hLines, colMapping, colEngines };
    localStorage.setItem('ocr_grid_presets', JSON.stringify(presets));
    addLog(`[GRID] Preset "${name}" sauvegardé.`);
  };

  const loadGridPreset = (name) => {
    const presets = JSON.parse(localStorage.getItem('ocr_grid_presets') || '{}');
    const p = presets[name];
    if (p) {
      setVLines(p.vLines);
      setHLines(p.hLines);
      setColMapping(p.colMapping);
      if (p.colEngines) setColEngines(p.colEngines);
      addLog(`[GRID] Preset "${name}" appliqué.`);
    }
  };

  const deleteGridPreset = (name) => {
    if (!confirm(`Supprimer le preset "${name}" ?`)) return;
    const presets = JSON.parse(localStorage.getItem('ocr_grid_presets') || '{}');
    delete presets[name];
    localStorage.setItem('ocr_grid_presets', JSON.stringify(presets));
    addLog(`[GRID] Preset "${name}" supprimé.`);
    // Force re-render by toggling a state
    setShowHelp(false);
    setTimeout(() => setShowHelp(true), 100);
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

  // [NEW] Load workplaces for matching
  const [workplaces, setWorkplaces] = useState([]);
  useEffect(() => {
    if (mode === 'worker') {
      db.getWorkplaces().then(setWorkplaces);
    }
  }, [mode]);

  // NEW: Track which engine handles which column in Hybrid Mode
  const [colEngines, setColEngines] = useState([
    'tesseract', // Default for Col 1
    'paddle', // Default for Col 2
    'paddle', // Default for Col 3
    'paddle', // Default for Col 4
  ]);

  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);
  const canvasRef = useRef(null);

  // [NEW] Refs for direct DOM manipulation during drag for performance
  const vLineRefs = useRef([]);
  const hLineRefs = useRef([]);

  const colOptions = [
    { val: 'national_id', label: 'Matricule' },
    { val: 'full_name', label: 'Nom & Prénom' },
    { val: 'department_id', label: 'Service' },
    { val: 'workplace_id', label: 'Lieu de travail' }, // [NEW] Added Lieu de travail
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

          canvas.toBlob(
            (blob) => {
              if (!blob) return;
              const blobUrl = URL.createObjectURL(blob);

              // Clean up old Blob URL if exists
              if (image && image.startsWith('blob:')) {
                URL.revokeObjectURL(image);
              }

              setImage(blobUrl);
              setImgDimensions({ width, height });
              setCandidates([]);
              setHLines([]);
              setErrorMessage(null);

              // MEMORY MANAGEMENT: Aggressively dump old images
              setDebugCrops([]);
              setDebugBoxes([]);

              setActiveTab('scan');
              setLogs([]); // Reset logs
              addLog(`[LOAD] Image chargée (Blob). Dimensions: ${width}x${height}px`);
            },
            'image/jpeg',
            0.95
          );
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  // ========== TESSERACT HELPER (RESTORED EXACTLY) ==========
  const getCellImage = (
    imgElement,
    rect,
    paddingY = 8,
    paddingX = 8,
    binarize = false,
    customScale = 2.2,
    bufferX = 8,
    bufferY = 8
  ) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const scale = customScale;

    // [DYNAMIC BUFFER] Column-specific reach (IDs get 16px, Names get 8px)
    const bX = bufferX;
    const bY = bufferY;

    const sourceX = Math.max(0, rect.x - bX);
    const sourceY = Math.max(0, rect.y - bY);
    const sourceW = rect.width + bX * 2;
    const sourceH = rect.height + bY * 2;

    const targetW = Math.floor((sourceW + paddingX * 2) * scale);
    const targetH = Math.floor((sourceH + paddingY * 2) * scale);

    if (targetW <= 0 || targetH <= 0) return null;

    canvas.width = targetW;
    canvas.height = targetH;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    if (binarize) {
      // Google-Challenger contrast: Sharpens text edges and nukes background noise
      ctx.filter = 'contrast(140%) grayscale(100%) brightness(95%)';
    }

    ctx.drawImage(
      imgElement,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      paddingX * scale,
      paddingY * scale,
      sourceW * scale,
      sourceH * scale
    );

    if (binarize) ctx.filter = 'none';
    return canvas.toDataURL('image/png');
  };

  // ========== VISUAL DEBUGGER (RESTORED) ==========
  const drawDebugGrid = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !imageRef.current.naturalWidth) return;
    const ctx = canvas.getContext('2d');

    const displayW = canvas.offsetWidth;
    const displayH = canvas.offsetHeight;

    // Only resize the buffer if it actually changed (prevents memory spikes)
    if (canvas.width !== displayW || canvas.height !== displayH) {
      canvas.width = displayW;
      canvas.height = displayH;
    }

    const naturalW = imageRef.current.naturalWidth;
    const naturalH = imageRef.current.naturalHeight;
    const scaleX = canvas.width / naturalW;
    const scaleY = canvas.height / naturalH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);

    // Draw Rows
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.lineWidth = 2;
    for (let r = 0; r < sortedH.length - 1; r++) {
      const y = sortedH[r] * canvas.height;
      const h = (sortedH[r + 1] - sortedH[r]) * canvas.height;
      ctx.strokeRect(0, y, canvas.width, h);
      ctx.fillStyle = 'red';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`R${r + 1}`, 5, y + 15);
    }

    // Draw Cols
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.6)';
    vLines.forEach((v, i) => {
      const x = v * canvas.width;
      ctx.strokeRect(x, 0, 1, canvas.height);
      ctx.fillStyle = 'blue';
      ctx.fillText(`C${i + 1}`, x + 5, 15);
    });

    // 2. Visual Language Augmentation (Diagnostic Engine)
    if (debugBoxes.length > 0) {
      debugBoxes.forEach((box) => {
        const conf = typeof box.confidence === 'number' ? box.confidence : 100;
        const isAligned = typeof box.isAligned !== 'undefined' ? box.isAligned : true;

        let color = '#22c55e'; // Green (>85% + Aligned)
        let fill = 'rgba(34, 197, 94, 0.15)';
        ctx.setLineDash([]); // Reset dash

        if (conf < 60) {
          color = '#ef4444'; // Red (<60%)
          fill = 'rgba(239, 68, 68, 0.2)';
        } else if (!isAligned) {
          color = '#d946ef'; // Magenta (Misaligned)
          fill = 'rgba(217, 70, 239, 0.15)';
          ctx.setLineDash([5, 5]); // Dashed line for misalignment
        } else if (conf <= 85) {
          color = '#eab308'; // Yellow (60-85%)
          fill = 'rgba(234, 179, 8, 0.2)';
        }

        ctx.strokeStyle = color;
        ctx.fillStyle = fill;
        ctx.lineWidth = 2;

        // Draw scaled polygon
        if (box.box && box.box.length === 4) {
          ctx.beginPath();
          ctx.moveTo(box.box[0][0] * scaleX, box.box[0][1] * scaleY);
          ctx.lineTo(box.box[1][0] * scaleX, box.box[1][1] * scaleY);
          ctx.lineTo(box.box[2][0] * scaleX, box.box[2][1] * scaleY);
          ctx.lineTo(box.box[3][0] * scaleX, box.box[3][1] * scaleY);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Small text label for confidence
          if (debugMode) {
            ctx.setLineDash([]);
            ctx.fillStyle = color;
            ctx.font = '10px sans-serif';
            ctx.fillText(
              `${Math.round(conf)}%`,
              box.box[0][0] * scaleX,
              box.box[0][1] * scaleY - 2
            );
          }
        }
      });
    }

    addLog('[DEBUG] Diagnostic layer updated.');
  };

  // AUTO-DEBUG: Redraw whenever grid/debug mode/tab changes
  useEffect(() => {
    if (debugMode && image && activeTab === 'scan') {
      // Small timeout to ensure image ref is ready/layout stable
      const timer = setTimeout(drawDebugGrid, 100);
      return () => clearTimeout(timer);
    }
  }, [debugMode, image, hLines, vLines, debugBoxes, activeTab]);

  const runTesseractOCR = async () => {
    if (!image || !imageRef.current) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setLogs([]);
    setDebugCrops([]);
    setCandidates([]);
    setProgress(0);
    setStatusText('Tesseract (Parallel Workers)...');

    const isRTL = docLanguage === 'ara';
    let currentWorkers = tesseractWorkersRef.current;
    let currentFraWorkers = tesseractFraWorkersRef.current;

    try {
      const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);

      // [SMART LANG] Main pool for Names (Arabic/French)
      const needsArabic =
        isRTL && colMapping.some((field, idx) => field === 'full_name' || field === 'job_info');
      const mainLangs = needsArabic ? 'ara+fra' : 'fra';

      const hardwareCores = window.navigator.hardwareConcurrency || 1;
      const numWorkers = Math.min(2, Math.max(1, hardwareCores - 1));

      // 1. Initialize Main Pool
      if (currentWorkers.length !== numWorkers || currentLangsRef.current !== mainLangs) {
        addLog(`[TESSERACT] Initializing Main Pool (${mainLangs})...`);
        currentWorkers.forEach((w) => w.terminate());
        currentWorkers = [];
        currentLangsRef.current = mainLangs;
        for (let i = 0; i < numWorkers; i++) {
          const tessConfig = await resolveTesseractAssetConfig(mainLangs);
          const w = await window.Tesseract.createWorker(
            mainLangs,
            window.Tesseract.OEM?.DEFAULT || 3,
            {
              workerPath: tessConfig.workerPath,
              corePath: tessConfig.corePath,
              langPath: tessConfig.langPath,
              workerBlob: true,
              gzip: tessConfig.gzip,
              cacheMethod: 'none',
            }
          );
          currentWorkers.push(w);
        }
        tesseractWorkersRef.current = currentWorkers;
      }

      // 2. Initialize Dedicated Latin Pool (Always 'fra')
      if (currentFraWorkers.length === 0) {
        addLog(`[TESSERACT] Initializing Latin-Only Pool (fra)...`);
        const tessConfig = await resolveTesseractAssetConfig('fra');
        const w = await window.Tesseract.createWorker('fra', window.Tesseract.OEM?.DEFAULT || 3, {
          workerPath: tessConfig.workerPath,
          corePath: tessConfig.corePath,
          langPath: tessConfig.langPath,
          workerBlob: true,
          gzip: tessConfig.gzip,
          cacheMethod: 'none',
        });
        currentFraWorkers = [w];
        tesseractFraWorkersRef.current = currentFraWorkers;
      }

      const numRows = sortedH.length - 1;
      const numCols = sortedV.length - 1;
      let gridResults = Array(numRows)
        .fill(null)
        .map(() => createEmptyCandidate());
      let cellsProcessed = 0;
      const totalCells = numRows * numCols;

      for (let c = 0; c < numCols; c++) {
        const colIndex = isRTL ? numCols - 1 - c : c;
        const field = colMapping[colIndex];
        if (!field || field === 'ignore') {
          cellsProcessed += numRows;
          continue;
        }

        const isID = field === 'national_id';
        // ROUTING: Use Latin pool for IDs, Main pool for others
        const activePool = isID ? currentFraWorkers : currentWorkers;

        const params = isID
          ? {
              tessedit_pageseg_mode: '7',
              preserve_interword_spaces: '0',
              tessedit_char_whitelist:
                '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-.',
              tessedit_char_blacklist: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
            }
          : {
              tessedit_pageseg_mode: '7',
              preserve_interword_spaces: '1',
              tessedit_char_whitelist: '',
              tessedit_char_blacklist: '',
            };

        await Promise.all(activePool.map((w) => w.setParameters(params)));

        const promises = [];
        for (let r = 0; r < numRows; r++) {
          const workerIndex = r % activePool.length;
          const task = async () => {
            if (!isMounted.current) return;
            const rect = {
              x: sortedV[colIndex] * imgDimensions.width,
              y: sortedH[r] * imgDimensions.height,
              width: (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width,
              height: (sortedH[r + 1] - sortedH[r]) * imgDimensions.height,
            };

            const padding = isID ? 10 : 5;
            const bufferX = isID ? 10 : 8;
            const tessScale = 2.5;
            const tessBinarize = isID;

            const cellUrl = getCellImage(
              imageRef.current,
              rect,
              5,
              padding,
              tessBinarize,
              tessScale,
              bufferX,
              5
            );

            if (debugMode && isMounted.current) {
              setDebugCrops((prev) => [
                ...prev,
                { label: `R${r + 1}C${c + 1} (${field})`, url: cellUrl },
              ]);
            }

            const {
              data: { text, confidence },
            } = await activePool[workerIndex].recognize(cellUrl);
            let cleanText = text.trim();
            if (isID) cleanText = cleanText.replace(/[\u0600-\u06FF]/g, ''); // Extra safety

            if (cleanText && isMounted.current) {
              gridResults[r][field] = cleanText;
              addLog(`[CELL] R${r + 1}C${c + 1}: ${cleanText} (${confidence}%)`);
            }

            // ... (debugBox logic)
            if (debugMode && isMounted.current) {
              setDebugBoxes((prev) => [
                ...prev,
                {
                  box: [
                    [rect.x, rect.y],
                    [rect.x + rect.width, rect.y],
                    [rect.x + rect.width, rect.y + rect.height],
                    [rect.x, rect.y + rect.height],
                  ],
                  text: cleanText,
                  confidence,
                  isAligned: true,
                },
              ]);
            }
            cellsProcessed++;
            if (isMounted.current) setProgress(Math.round((cellsProcessed / totalCells) * 100));
          };
          promises.push(task());
        }
        await Promise.all(promises);
      }

      // RESTORED: Trigger Arabic detection before setting candidates
      gridResults.forEach((c) => cleanCandidate(c));

      if (isMounted.current) {
        setCandidates(gridResults.filter((c) => c.national_id || c.full_name || c.job_info));
        if (!debugMode && gridResults.length > 0) {
          setActiveTab('results');
        } else if (debugMode) {
          addLog('[DEBUG] Fin du scan. Résultats non affichés (Mode Debug actif).');
        }
      }
    } catch (e) {
      if (isMounted.current) {
        addLog(`[CRASH] ${e.message}`);
        console.error(e);
      }
    } finally {
      if (isMounted.current) setIsProcessing(false);
    }
  };

  // ========== MODE 2: PADDLE FULL PAGE (CELLULAR MODE RESTORED + IMPROVED) ==========
  // Helper function to get the correct models URL for Capacitor APK
  const getModelsUrl = () => {
    return getAssetUrl('/models', true);
  };

  const runPaddleOCR = async () => {
    if (!image || !imageRef.current) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setLogs([]);
    setDebugCrops([]);
    setCandidates([]);
    setProgress(0);
    setStatusText('Paddle AI (Cellular Mode)...');

    const isRTL = docLanguage === 'ara';
    try {
      // [REUSE LOGIC]
      if (!paddleOcrRef.current) {
        const modelsUrl = getModelsUrl();
        paddleOcrRef.current = await Ocr.create({
          models: {
            detectionPath: `${modelsUrl}/det.onnx`,
            recognitionPath: `${modelsUrl}/rec_ara.onnx`,
            dictionaryPath: `${modelsUrl}/keys_ara.txt`,
          },
        });
        addLog('[PADDLE] Engine initialized.');
      } else {
        addLog('[PADDLE] Reusing existing engine.');
      }

      const ocr = paddleOcrRef.current;

      const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
      const numRows = sortedH.length - 1;
      const numCols = sortedV.length - 1;
      let gridResults = Array(numRows)
        .fill(null)
        .map(() => createEmptyCandidate());
      const totalCells = numRows * numCols;
      let cellsProcessed = 0;
      let allDebugBoxes = [];

      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          if (!isMounted.current) break;

          const colIndex = isRTL ? numCols - 1 - c : c;
          const field = colMapping[colIndex];

          if (!field || field === 'ignore') {
            cellsProcessed++;
            continue;
          }

          const rawW = (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width;
          const rawH = (sortedH[r + 1] - sortedH[r]) * imgDimensions.height;
          const rect = {
            x: sortedV[colIndex] * imgDimensions.width,
            y: sortedH[r] * imgDimensions.height,
            width: rawW,
            height: rawH,
          };

          // [ELITE] ADAPTIVE ROW SENSING
          // Detect if rows are "compact" (small height) and shrink the detection padding
          // to prevent bleeding into adjacent rows.
          let unclipRatio = 1.6; // Default
          if (rawH < 45) {
            unclipRatio = 1.3; // Compact Row Mode
            if (cellsProcessed === 0) addLog('[ADAPTIVE] Compact layout detected. Tightening boxes.');
          }

          const isID = field === 'national_id';
          const padding = isID ? 25 : 8;
          const bufferX = isID ? 10 : 8;
          const scale = 2.2;
          const cellUrl = getCellImage(
            imageRef.current,
            rect,
            8,
            padding,
            false,
            scale,
            bufferX,
            8
          );

          if (debugMode && isMounted.current) {
            setDebugCrops((prev) => [
              ...prev,
              { label: `R${r + 1}C${c + 1} (${field})`, url: cellUrl },
            ]);
          }

          const results = await ocr.detect(cellUrl, {
            det_db_unclip_ratio: unclipRatio,
          });
          if (!isMounted.current) break;

          if (debugMode) {
            const newBoxes = results.map((box) => {
              const sourceX = Math.max(0, rect.x - bufferX);
              const sourceY = Math.max(0, rect.y - 8);

              const mapPoint = (p) => [
                p[0] / scale - padding + sourceX,
                p[1] / scale - 8 + sourceY,
              ];

              const mappedBox = box.box.map(mapPoint);

              const boxCenterX = (mappedBox[0][0] + mappedBox[2][0]) / 2;
              const boxCenterY = (mappedBox[0][1] + mappedBox[2][1]) / 2;
              const cellCenterX = rect.x + rect.width / 2;
              const cellCenterY = rect.y + rect.height / 2;

              const distX = Math.abs(boxCenterX - cellCenterX);
              const distY = Math.abs(boxCenterY - cellCenterY);
              const isAligned = distX < rect.width * 0.2 && distY < rect.height * 0.2;

              const confidence =
                typeof box.confidence !== 'undefined'
                  ? box.confidence
                  : typeof box.prob !== 'undefined'
                  ? Math.round(box.prob * 100)
                  : 100;

              return {
                box: mappedBox,
                text: box.text,
                confidence: confidence,
                isAligned: isAligned,
              };
            });
            setDebugBoxes((prev) => [...prev, ...newBoxes]);
          }

          let text = results
            .map((box) => box.text)
            .join(' ')
            .trim();
          if (text) {
            text = text.replace(/[|]/g, '').trim();

            // [MATRICULE SANITIZER] Strip any accidental Arabic characters from IDs
            if (isID) {
              text = text.replace(/[\u0600-\u06FF]/g, '').trim();
            }

            if (isRTL && !isID) text = smartRTLFix(text);
            gridResults[r][field] = text;

            const avgConf =
              results.length > 0
                ? Math.round(
                    results.reduce((acc, b) => acc + (b.confidence || b.prob * 100 || 100), 0) /
                      results.length
                  )
                : 0;
            if (isMounted.current)
              addLog(`[CELL] R${r + 1}C${c + 1} (${field}): ${text} (${avgConf}%)`);
          }

          cellsProcessed++;
          if (isMounted.current) setProgress(Math.round((cellsProcessed / totalCells) * 100));
        }
      }

      // RESTORED: Trigger Arabic detection before setting candidates
      gridResults.forEach((c) => cleanCandidate(c));

      if (isMounted.current) {
        setCandidates(gridResults.filter((c) => c.national_id || c.full_name || c.job_info));
        if (debugMode) {
          // setDebugBoxes(allDebugBoxes); // Removed to prevent state fighting
          addLog(`[DEBUG] Scan terminé. Resté sur l'onglet Scan.`);
          setTimeout(drawDebugGrid, 100);
        }

        if (!debugMode && gridResults.length > 0) {
          setActiveTab('results');
        }
      }
    } catch (e) {
      if (isMounted.current) addLog(`[CRASH] ${e.message}`);
    } finally {
      if (isMounted.current) setIsProcessing(false);
    }
  };

  // ========== MODE 3: HYBRID (SMART CELLULAR) ==========
  const runHybridOCR = async () => {
    if (!image || !imageRef.current) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setLogs([]);
    setCandidates([]);
    setProgress(0);
    setStatusText('Hybrid Mode (Smart Cellular)...');

    const isRTL = docLanguage === 'ara';
    let currentWorkers = tesseractWorkersRef.current;
    let currentFraWorkers = tesseractFraWorkersRef.current;

    try {
      if (isMounted.current) addLog('[HYBRID] Starting Engines...');
      const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);

      // [SMART HYBRID LANG] Main pool for Names
      const tesseractNeedsArabic =
        isRTL &&
        colMapping.some(
          (field, idx) =>
            colEngines[idx] === 'tesseract' && (field === 'full_name' || field === 'job_info')
        );
      const mainLangs = tesseractNeedsArabic ? 'ara+fra' : 'fra';

      const hardwareCores = window.navigator.hardwareConcurrency || 1;
      const numTesseractWorkers = Math.min(2, Math.max(1, hardwareCores - 1));

      // 1. Init Main Pool
      if (currentWorkers.length !== numTesseractWorkers || currentLangsRef.current !== mainLangs) {
        const tessConfig = await resolveTesseractAssetConfig(mainLangs);
        addLog(`[HYBRID] Initializing Main Pool (${mainLangs})...`);
        currentWorkers.forEach((w) => w.terminate());
        currentWorkers = [];
        currentLangsRef.current = mainLangs;
        for (let i = 0; i < numTesseractWorkers; i++) {
          const w = await window.Tesseract.createWorker(
            mainLangs,
            window.Tesseract.OEM?.DEFAULT || 3,
            {
              workerPath: tessConfig.workerPath,
              corePath: tessConfig.corePath,
              langPath: tessConfig.langPath,
              workerBlob: true,
              gzip: tessConfig.gzip,
              cacheMethod: 'none',
              logger: (m) => {
                if (isMounted.current)
                  addLog(
                    `[HYBRID_W${i}] ${m.status}: ${m.progress ? Math.round(m.progress * 100) : 0}%`
                  );
              },
            }
          );
          currentWorkers.push(w);
        }
        tesseractWorkersRef.current = currentWorkers;
      }

      // 2. Init Dedicated Latin Pool
      if (currentFraWorkers.length === 0) {
        addLog(`[HYBRID] Initializing Latin-Only Pool (fra)...`);
        const tessConfig = await resolveTesseractAssetConfig('fra');
        const w = await window.Tesseract.createWorker('fra', window.Tesseract.OEM?.DEFAULT || 3, {
          workerPath: tessConfig.workerPath,
          corePath: tessConfig.corePath,
          langPath: tessConfig.langPath,
          workerBlob: true,
          gzip: tessConfig.gzip,
          cacheMethod: 'none',
        });
        currentFraWorkers = [w];
        tesseractFraWorkersRef.current = currentFraWorkers;
      }

      // 3. Init Paddle if needed
      if (!paddleOcrRef.current) {
        const modelsUrl = getModelsUrl();
        paddleOcrRef.current = await Ocr.create({
          models: {
            detectionPath: `${modelsUrl}/det.onnx`,
            recognitionPath: `${modelsUrl}/rec_ara.onnx`,
            dictionaryPath: `${modelsUrl}/keys_ara.txt`,
          },
        });
        addLog('[HYBRID] Paddle initialized.');
      }
      const currentPaddleOcr = paddleOcrRef.current;

      const numRows = sortedH.length - 1;
      const numCols = sortedV.length - 1;
      let gridResults = Array(numRows)
        .fill(null)
        .map(() => createEmptyCandidate());
      const totalCells = numRows * numCols;
      let cellsProcessed = 0;

      for (let c = 0; c < numCols; c++) {
        if (!isMounted.current) break;
        const colIndex = isRTL ? numCols - 1 - c : c;
        const field = colMapping[colIndex];
        if (!field || field === 'ignore') {
          cellsProcessed += numRows;
          continue;
        }

        const enginePreference = colEngines[colIndex] || 'paddle';
        const isID = field === 'national_id';

        if (enginePreference === 'tesseract') {
          // ROUTING: Hand IDs to the Latin-only Pool
          const activePool = isID ? currentFraWorkers : currentWorkers;

          if (isMounted.current)
            addLog(`[HYBRID] Column "${field}" -> Tesseract (${isID ? 'Latin-Only' : 'Main'})`);

          const params = {
            tessedit_pageseg_mode: '7',
            preserve_interword_spaces: isID ? '0' : '1',
            tessedit_char_whitelist: isID
              ? '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-.'
              : '',
            tessedit_char_blacklist: isID ? 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي' : '',
          };
          await Promise.all(activePool.map((w) => w.setParameters(params)));

          const promises = [];
          for (let r = 0; r < numRows; r++) {
            const worker = activePool[r % activePool.length];
            const task = async () => {
              if (!isMounted.current) return;
              const rect = {
                x: sortedV[colIndex] * imgDimensions.width,
                y: sortedH[r] * imgDimensions.height,
                width: (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width,
                height: (sortedH[r + 1] - sortedH[r]) * imgDimensions.height,
              };

              const padding = isID ? 15 : 5;
              const bufferX = isID ? 12 : 8;
              const tessScale = isID ? 3.5 : 2.5;
              const tessBinarize = isID;
              const cellUrl = getCellImage(
                imageRef.current,
                rect,
                5,
                padding,
                tessBinarize,
                tessScale,
                bufferX,
                5
              );

              if (debugMode && isMounted.current) {
                setDebugCrops((prev) => [
                  ...prev,
                  { label: `R${r + 1}C${c + 1} (${field})`, url: cellUrl },
                ]);
              }

              const {
                data: { text, confidence },
              } = await worker.recognize(cellUrl);
              let cleanText = text.trim();
              if (isID) cleanText = cleanText.replace(/[\u0600-\u06FF]/g, '');
              if (cleanText && isMounted.current) gridResults[r][field] = cleanText;

              if (debugMode && isMounted.current) {
                setDebugBoxes((prev) => [
                  ...prev,
                  {
                    box: [
                      [rect.x, rect.y],
                      [rect.x + rect.width, rect.y],
                      [rect.x + rect.width, rect.y + rect.height],
                      [rect.x, rect.y + rect.height],
                    ],
                    text: cleanText,
                    confidence,
                    isAligned: true,
                  },
                ]);
              }
              if (isMounted.current)
                addLog(`[HYBRID_CELL] ${field}: ${cleanText} (${confidence}%)`);
              cellsProcessed++;
              if (isMounted.current) setProgress(Math.round((cellsProcessed / totalCells) * 100));
            };
            promises.push(task());
          }
          await Promise.all(promises);
        } else {
          // ... (Paddle Hybrid logic remains correct)
          if (isMounted.current) addLog(`[HYBRID] Column "${field}" -> Paddle (Text Cellular)`);
          for (let r = 0; r < numRows; r++) {
            if (!isMounted.current) break;
            const cropParams = {
              x: sortedV[colIndex] * imgDimensions.width,
              y: sortedH[r] * imgDimensions.height,
              width: (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width,
              height: (sortedH[r + 1] - sortedH[r]) * imgDimensions.height,
            };
            const padding = isID ? 25 : 8;
            const bufferX = isID ? 10 : 8;
            const scale = 2.2;
            const cellUrl = getCellImage(
              imageRef.current,
              cropParams,
              8,
              padding,
              false,
              scale,
              bufferX,
              8
            );

            if (debugMode && isMounted.current) {
              setDebugCrops((prev) => [
                ...prev,
                { label: `R${r + 1}C${c + 1} (${field})`, url: cellUrl },
              ]);
            }

            const results = await currentPaddleOcr.detect(cellUrl);
            if (!isMounted.current) break;

            if (debugMode) {
              const newBoxes = results.map((box) => {
                const sourceX = Math.max(0, cropParams.x - bufferX);
                const sourceY = Math.max(0, cropParams.y - 8);
                const mapPoint = (p) => [
                  p[0] / scale - padding + sourceX,
                  p[1] / scale - 8 + sourceY,
                ];
                const mappedBox = box.box.map(mapPoint);
                const boxCenterX = (mappedBox[0][0] + mappedBox[2][0]) / 2;
                const boxCenterY = (mappedBox[0][1] + mappedBox[2][1]) / 2;
                const cellCenterX = cropParams.x + cropParams.width / 2;
                const cellCenterY = cropParams.y + cropParams.height / 2;
                const distX = Math.abs(boxCenterX - cellCenterX);
                const distY = Math.abs(boxCenterY - cellCenterY);
                const isAligned = distX < cropParams.width * 0.2 && distY < cropParams.height * 0.2;
                const confidence =
                  typeof box.confidence !== 'undefined'
                    ? box.confidence
                    : typeof box.prob !== 'undefined'
                    ? Math.round(box.prob * 100)
                    : 100;
                return { box: mappedBox, text: box.text, confidence, isAligned };
              });
              setDebugBoxes((prev) => [...prev, ...newBoxes]);
            }

            let text = results
              .map((b) => b.text)
              .join(' ')
              .trim();
            if (text) {
              text = text.replace(/[|]/g, '').trim();
              if (isID) text = text.replace(/[\u0600-\u06FF]/g, '').trim();
              if (isRTL && !isID) text = smartRTLFix(text);
              gridResults[r][field] = text;
              const avgConf =
                results.length > 0
                  ? Math.round(
                      results.reduce((acc, b) => acc + (b.confidence || b.prob * 100 || 100), 0) /
                        results.length
                    )
                  : 0;
              if (isMounted.current) addLog(`[HYBRID_CELL] ${field}: ${text} (${avgConf}%)`);
            }
            cellsProcessed++;
            if (isMounted.current) setProgress(Math.round((cellsProcessed / totalCells) * 100));
          }
        }
      }

      // RESTORED: Trigger Arabic detection before setting candidates
      gridResults.forEach((c) => cleanCandidate(c));

      if (isMounted.current) {
        setCandidates(gridResults.filter((c) => c.national_id || c.full_name));
        if (!debugMode && gridResults.length > 0) {
          setActiveTab('results');
        } else if (debugMode) {
          addLog('[DEBUG] Fin du scan. Résultats non affichés (Mode Debug actif).');
        }
      }
    } catch (e) {
      if (isMounted.current) addLog(`[CRASH] ${e.message}`);
    } finally {
      if (isMounted.current) setIsProcessing(false);
    }
  };
  // --- MASTER SWITCH ---
  const handleGo = async () => {
    setErrorMessage(null); // Clear previous errors
    setIsProcessing(true); // Indicate processing has started
    setDebugBoxes([]); // Clear previous debug boxes
    setDebugCrops([]); // [MEMORY FIX] Clear old traces to prevent OOM
    try {
      if (ocrEngine === 'paddle') {
        await runPaddleOCR(); // Now Cellular (Slice-then-Read)
      } else if (ocrEngine === 'hybrid') {
        await runHybridOCR();
      } else {
        await runTesseractOCR(); // Now Parallel
      }
    } catch (e) {
      console.error('OCR Process Fatal Error:', e);
      addLog(`[GLOBAL_ERROR] ${e.message}`);
      setErrorMessage(
        `Une erreur est survenue pendant le scan OCR: ${e.message}. Veuillez réessayer.`
      );
    } finally {
      // Ensure processing state is reset, even if an error occurs
      setIsProcessing(false);
    }
  };

  // --- HELPERS (RESTORED) ---
  const createEmptyCandidate = () => ({
    id: Math.random(),
    full_name: '', // Text currently shown in the box
    original_ar: '', // The Arabic anchor
    manual_fr: '', // Your specific French correction
    is_viewing_ar: true,
    national_id: '',
    raw_id: '',
    department_id: '',
    workplace_id: '', // [NEW]
    job_info: '',
    raw_job: '',
    isArabic: false,
  });

  const cleanCandidate = (c) => {
    // 1. Lock in the pure raw OCR output (NEVER OVERWRITTEN)
    c.raw_id = c.national_id;
    c.raw_name = c.full_name;
    c.raw_job = c.job_info;

    // 2. Initialize Suggestion Flags
    c.suggested_id = null;
    c.suggested_name = null;
    c.suggested_job = null;

    // [NEW] AUTO-MATCHING FOR SERVICES & WORKPLACES
    const normalize = (str) => (str ? str.toString().trim().toLowerCase() : '');
    
    if (c.department_id) {
      const scannedDept = normalize(c.department_id);
      const match = departments.find(d => normalize(d.name) === scannedDept);
      if (match) {
        c.department_id = match.id;
      } else {
        // Keep the text temporarily so user can see what was scanned
        // But the select will show "-" because scanned text isn't a valid ID
      }
    }

    if (c.workplace_id) {
      const scannedWp = normalize(c.workplace_id);
      const match = workplaces.find(w => normalize(w.name) === scannedWp);
      if (match) {
        c.workplace_id = match.id;
      }
    }

    // 3. Background AI Detection (Does NOT overwrite)
    try {
      const dict = JSON.parse(
        localStorage.getItem('ocr_smart_dict') || '{"national_id":{},"full_name":{},"job_info":{}}'
      );
      if (c.national_id) {
        const key = c.national_id.replace(/\s+/g, '').toLowerCase();
        if (dict.national_id[key] && dict.national_id[key] !== c.national_id)
          c.suggested_id = dict.national_id[key];
      }
      if (c.job_info) {
        const key = c.job_info.replace(/\s+/g, '').toLowerCase();
        if (dict.job_info[key] && dict.job_info[key] !== c.job_info)
          c.suggested_job = dict.job_info[key];
      }
      if (c.full_name) {
        const key = c.full_name.replace(/\s+/g, '').toLowerCase();
        if (dict.full_name[key] && dict.full_name[key] !== c.full_name)
          c.suggested_name = dict.full_name[key];
      }
    } catch (e) {
      console.warn('Dictionary error', e);
    }

    // 4. Identify the base language from the RAW scan
    const isAr = /[\u0600-\u06FF]/.test(c.full_name);
    c.isArabic = isAr;
    c.is_viewing_ar = isAr;

    // 5. Set the Symmetric Master Anchor
    if (isAr) {
      c.original_ar = c.full_name;
      c.manual_fr = '';
    } else {
      c.manual_fr = c.full_name;
      c.original_ar = '';
    }
  };

  // [NEW] Apply a specific AI suggestion when the user clicks the Star
  const applySuggestion = (id, fieldType) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c };

        if (fieldType === 'national_id' && updated.suggested_id) {
          updated.national_id = updated.suggested_id;
          updated.suggested_id = null;
        } else if (fieldType === 'job_info' && updated.suggested_job) {
          updated.job_info = updated.suggested_job;
          updated.suggested_job = null;
        } else if (fieldType === 'full_name' && updated.suggested_name) {
          updated.full_name = updated.suggested_name;
          updated.suggested_name = null;

          // Sync anchors so translation doesn't break
          if (updated.is_viewing_ar) {
            updated.original_ar = updated.full_name;
            if (updated.isArabic) updated.manual_fr = '';
          } else {
            updated.manual_fr = updated.full_name;
            if (!updated.isArabic) updated.original_ar = '';
          }
        }
        return updated;
      })
    );
  };

  // [NEW] Master button to apply ALL stars on the screen at once
  const applyAllSuggestions = () => {
    setCandidates((prev) =>
      prev.map((c) => {
        const updated = { ...c };
        if (updated.suggested_id) {
          updated.national_id = updated.suggested_id;
          updated.suggested_id = null;
        }
        if (updated.suggested_job) {
          updated.job_info = updated.suggested_job;
          updated.suggested_job = null;
        }
        if (updated.suggested_name) {
          updated.full_name = updated.suggested_name;
          updated.suggested_name = null;
          if (updated.is_viewing_ar) {
            updated.original_ar = updated.full_name;
            if (updated.isArabic) updated.manual_fr = '';
          } else {
            updated.manual_fr = updated.full_name;
            if (!updated.isArabic) updated.original_ar = '';
          }
        }
        return updated;
      })
    );
  };

  const updateCandidate = (id, field, val) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: val } : c)));
  };
  const removeCandidate = (id) => setCandidates((prev) => prev.filter((c) => c.id !== id));

  const handleBulkImport = async () => {
    if (candidates.length === 0) return;
    const valid = candidates.filter((c) => c.full_name || c.national_id);

    // --- MACHINE LEARNING MEMORY UPDATE (SPACE-IMMUNE) ---
    try {
      let dict = JSON.parse(
        localStorage.getItem('ocr_smart_dict') || '{"national_id":{},"full_name":{},"job_info":{}}'
      );
      valid.forEach((c) => {
        // Save corrections by stripping spaces from the raw OCR key
        if (c.raw_id && c.national_id && c.raw_id !== c.national_id) {
          dict.national_id[c.raw_id.replace(/\s+/g, '')] = c.national_id.trim();
        }
        if (c.raw_name && c.full_name && c.raw_name !== c.full_name) {
          dict.full_name[c.raw_name.replace(/\s+/g, '')] = c.full_name.trim();
        }
        if (c.raw_job && c.job_info && c.raw_job !== c.job_info) {
          dict.job_info[c.raw_job.replace(/\s+/g, '')] = c.job_info.trim();
        }
      });
      localStorage.setItem('ocr_smart_dict', JSON.stringify(dict));
    } catch (e) {}
    // ---------------------------------------------------

    let importedCount = 0;
    let skippedCount = 0;

    try {
      // Fetch existing records for duplicate check
      const existing =
        mode === 'worker' ? await db.getWorkers() : await db.getWeaponHolders();

      const normalize = (str) => (str ? str.toString().trim().toLowerCase() : '');

      for (const c of valid) {
        const currentName = normalize(c.full_name);
        const currentId = normalize(c.national_id);

        // Check for duplicates
        const isDuplicate = existing.some((item) => {
          const nameMatch = normalize(item.full_name) === currentName;
          const idMatch = currentId && normalize(item.national_id) === currentId;
          return nameMatch || idMatch;
        });

        if (isDuplicate) {
          skippedCount++;
          continue;
        }

        const data = {
          full_name: c.full_name || 'Inconnu',
          national_id: c.national_id || '?',
          department_id: c.department_id ? parseInt(c.department_id) : null,
          workplace_id: c.workplace_id ? parseInt(c.workplace_id) : null, // [NEW]
          status: mode === 'worker' ? 'active' : 'pending',
          created_at: new Date().toISOString(),
        };

        if (mode === 'worker') {
          data.job_role = c.job_info || 'N/A';
          data.position = c.job_info || 'N/A';
          await db.saveWorker(data);
        } else {
          data.job_function = c.job_info || 'Agent';
          await db.saveWeaponHolder(data);
        }
        importedCount++;
      }
    } catch (err) {
      console.error('Import error:', err);
    }

    onImportSuccess(importedCount, skippedCount);
    onClose();
  };

  // --- DICTIONARY MANAGEMENT ---
  const exportDictionary = () => {
    const dict =
      localStorage.getItem('ocr_smart_dict') || '{"national_id":{},"full_name":{},"job_info":{}}';
    const blob = new Blob([dict], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Copro_Dictionary_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const applyDefaultDictionary = async () => {
    if (
      !confirm(
        'Voulez-vous charger le dictionnaire Algérien par défaut ? (Ceci fusionnera avec vos corrections existantes)'
      )
    )
      return;

    try {
      const response = await fetch(getAssetUrl('algerian_dictionary.json'));
      if (!response.ok) throw new Error('Impossible de charger le fichier dictionnaire.');

      const imported = await response.json();
      const existing = JSON.parse(
        localStorage.getItem('ocr_smart_dict') || '{"national_id":{},"full_name":{},"job_info":{}}'
      );

      // Merge
      existing.national_id = { ...existing.national_id, ...(imported.national_id || {}) };
      existing.full_name = { ...existing.full_name, ...(imported.full_name || {}) };
      existing.job_info = { ...existing.job_info, ...(imported.job_info || {}) };

      localStorage.setItem('ocr_smart_dict', JSON.stringify(existing));
      addLog('[DICT] Dictionnaire Algérien par défaut appliqué.');
      alert(
        'Dictionnaire Algérien chargé avec succès ! (' +
          Object.keys(imported.full_name).length +
          ' entrées)'
      );
    } catch (err) {
      console.error('Apply default dict failed:', err);
      alert('Erreur lors du chargement du dictionnaire par défaut.');
    }
  };

  const importDictionary = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        const existing = JSON.parse(
          localStorage.getItem('ocr_smart_dict') ||
            '{"national_id":{},"full_name":{},"job_info":{}}'
        );

        // Merge the uploaded dictionary with the existing one
        existing.national_id = { ...existing.national_id, ...(imported.national_id || {}) };
        existing.full_name = { ...existing.full_name, ...(imported.full_name || {}) };
        existing.job_info = { ...existing.job_info, ...(imported.job_info || {}) };

        localStorage.setItem('ocr_smart_dict', JSON.stringify(existing));
        alert('Dictionnaire importé et fusionné avec succès !');
      } catch (err) {
        alert('Erreur : Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay">
      {/* [NEW] MAGIC STAR ANIMATION */}
      <style>
        {`
          @keyframes magicPulse {
            0% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.5)); }
            50% { transform: scale(1.2); filter: drop-shadow(0 0 8px rgba(245, 158, 11, 1)); color: #f59e0b; }
            100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.5)); }
          }
          .magic-star-btn {
            animation: magicPulse 2s infinite ease-in-out;
            color: #d97706;
            background: none;
            border: none;
            cursor: pointer;
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 10;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .magic-star-btn:hover {
            animation: none;
            transform: translateY(-50%) scale(1.3);
            color: #f59e0b;
          }
        `}
      </style>

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
                    onClick={() => {
                      const sorted = [...vLines].sort((a, b) => a - b);
                      const lastPos = sorted.length > 0 ? sorted[sorted.length - 1] : 0.5;
                      let nextPos;
                      if (sorted.length >= 2) {
                        const delta = sorted[sorted.length - 1] - sorted[sorted.length - 2];
                        nextPos = lastPos + delta > 0.98 ? lastPos + 0.04 : lastPos + delta;
                      } else {
                        nextPos = lastPos + 0.1;
                      }
                      setVLines([...vLines, Math.min(0.99, nextPos)]);
                    }}
                    style={{ color: '#3b82f6', borderColor: '#3b82f6', fontWeight: 'bold' }}
                  >
                    + Col
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      const sorted = [...hLines].sort((a, b) => a - b);
                      let newH = 0.5;
                      if (sorted.length >= 2) {
                        // SMART SPACING: Calculate distance between last two lines
                        const delta = sorted[sorted.length - 1] - sorted[sorted.length - 2];
                        newH = sorted[sorted.length - 1] + delta;
                      } else if (sorted.length === 1) {
                        newH = sorted[0] + 0.05;
                      }
                      // Prevent spawning completely off-screen
                      if (newH > 0.98) newH = 0.95;
                      setHLines([...hLines, newH]);
                    }}
                    style={{ color: '#ef4444', borderColor: '#ef4444', fontWeight: 'bold' }}
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

                  {/* HELP BUTTON (moved debug toggle to bulb panel) */}
                  <button
                    className="btn btn-sm"
                    onClick={() => setShowHelp(true)}
                    title="Guide de Scan OCR"
                    style={{
                      border: '1px solid #0284c7',
                      color: '#0284c7',
                      background: 'white',
                      padding: '6px 8px',
                      minWidth: 'auto',
                    }}
                  >
                    <FaLightbulb />
                  </button>

                  {/* NEW: ENGINE TOGGLE */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
                    <div
                      style={{
                        display: 'flex',
                        background: '#e2e8f0',
                        borderRadius: '6px',
                        padding: '2px',
                      }}
                    >
                      <button
                        onClick={() => setOcrEngine('tesseract')}
                        style={{
                          background: ocrEngine === 'tesseract' ? 'white' : 'transparent',
                          color: ocrEngine === 'tesseract' ? '#0f172a' : '#64748b',
                          border: '1px solid transparent',
                          borderColor: ocrEngine === 'tesseract' ? '#cbd5e1' : 'transparent',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        Safe
                      </button>
                      <button
                        onClick={() => setOcrEngine('paddle')}
                        style={{
                          background: ocrEngine === 'paddle' ? 'white' : 'transparent',
                          color: ocrEngine === 'paddle' ? '#0f172a' : '#64748b',
                          border: '1px solid transparent',
                          borderColor: ocrEngine === 'paddle' ? '#cbd5e1' : 'transparent',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        Turbo
                      </button>
                      <button
                        onClick={() => setOcrEngine('hybrid')}
                        style={{
                          background: ocrEngine === 'hybrid' ? 'white' : 'transparent',
                          color: ocrEngine === 'hybrid' ? '#0f172a' : '#64748b',
                          border: '1px solid transparent',
                          borderColor: ocrEngine === 'hybrid' ? '#cbd5e1' : 'transparent',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        Hybrid
                      </button>
                    </div>

                    {!isProcessing && (
                      <button
                        onClick={handleGo}
                        className="btn btn-success btn-sm"
                        style={{ fontWeight: 'bold' }}
                      >
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
                {/* Interactive Editor with Scroll Gutter */}
                <div
                  style={{
                    position: 'relative',
                    minWidth: '600px',
                    display: 'block',
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
                      background: 'rgba(0, 0, 0, 0.05)',
                      borderLeft: '1px solid rgba(0, 0, 0, 0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      touchAction: 'auto',
                      pointerEvents: 'none', // Don't block horizontal scroll
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

                          {/* NEW: Explicit Engine Routing for Hybrid Mode */}
                          {ocrEngine === 'hybrid' && (
                            <select
                              className="input"
                              style={{
                                fontSize: '0.6rem',
                                padding: 0,
                                height: '18px',
                                width: '90%',
                                background: '#e2e8f0',
                                marginTop: '2px',
                                border: '1px solid #cbd5e1',
                              }}
                              value={colEngines[i] || 'paddle'}
                              onChange={(e) => {
                                const n = [...colEngines];
                                n[i] = e.target.value;
                                setColEngines(n);
                              }}
                            >
                              <option value="tesseract">Engine: Tess</option>
                              <option value="paddle">Engine: Paddle</option>
                            </select>
                          )}
                        </div>
                      ));
                    })()}
                  </div>

                  {/* STRICT IMAGE WRAPPER (Fixes the coordinate offset drift) */}
                  <div style={{ position: 'relative', marginTop: '30px' }}>
                    {/* Debug Canvas (OVERLAY) */}
                    <canvas
                      ref={canvasRef}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 35, // Below handles (40) but above image
                        pointerEvents: 'none',
                        display: debugMode ? 'block' : 'none',
                      }}
                    />
                    {/* MAIN IMAGE */}
                    <img
                      ref={imageRef}
                      src={image}
                      style={{ display: 'block', width: '100%', touchAction: 'auto' }}
                      alt="Scan"
                    />

                    {/* VERTICAL HANDLES */}
                    {vLines.map((x, i) => (
                      <div
                        key={`v-${i}`}
                        ref={(el) => (vLineRefs.current[i] = el)} // Attach ref
                        style={{
                          position: 'absolute',
                          top: 0,
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
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            // Store initial position
                            e.currentTarget.dataset.startX = e.clientX;
                            e.currentTarget.dataset.startLeft = vLineRefs.current[i].offsetLeft;
                          }}
                          onPointerMove={(e) => {
                            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                            const currentRef = vLineRefs.current[i];
                            const deltaX = e.clientX - parseFloat(e.currentTarget.dataset.startX);
                            const newLeft = parseFloat(e.currentTarget.dataset.startLeft) + deltaX;
                            const parentWidth = currentRef.parentElement.offsetWidth;
                            const newX = Math.max(0, Math.min(1, newLeft / parentWidth));
                            currentRef.style.left = `${newX * 100}%`; // Direct DOM manipulation
                          }}
                          onPointerUp={(e) => {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                            const currentRef = vLineRefs.current[i];
                            const parentWidth = currentRef.parentElement.offsetWidth;
                            const newX = currentRef.offsetLeft / parentWidth;
                            const nv = [...vLines];
                            nv[i] = Math.max(0, Math.min(1, newX));
                            setVLines(nv); // Update state only on drag end
                          }}
                        >
                          <FaArrowsAltH size={12} />
                        </div>
                      </div>
                    ))}

                    {/* HORIZONTAL HANDLES */}
                    {hLines.map((y, i) => (
                      <div
                        key={`h-${i}`}
                        ref={(el) => (hLineRefs.current[i] = el)} // Attach ref
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: `${y * 100}%`,
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
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            // Store initial position
                            e.currentTarget.dataset.startY = e.clientY;
                            e.currentTarget.dataset.startTop = hLineRefs.current[i].offsetTop;
                          }}
                          onPointerMove={(e) => {
                            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                            const currentRef = hLineRefs.current[i];
                            const deltaY = e.clientY - parseFloat(e.currentTarget.dataset.startY);
                            const newTop = parseFloat(e.currentTarget.dataset.startTop) + deltaY;
                            const parentHeight = currentRef.parentElement.offsetHeight;
                            const newY = Math.max(0, Math.min(1, newTop / parentHeight));
                            currentRef.style.top = `${newY * 100}%`; // Direct DOM manipulation
                          }}
                          onPointerUp={(e) => {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                            const currentRef = hLineRefs.current[i];
                            const parentHeight = currentRef.parentElement.offsetHeight;
                            const newY = currentRef.offsetTop / parentHeight;
                            const nh = [...hLines];
                            nh[i] = Math.max(0, Math.min(1, newY));
                            setHLines(nh); // Update state only on drag end
                          }}
                          onDoubleClick={() => setHLines(hLines.filter((_, idx) => idx !== i))}
                        >
                          <FaArrowsAltV size={12} />
                        </div>
                      </div>
                    ))}
                  </div>
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

            {/* Error Message */}
            {errorMessage && (
              <div
                style={{
                  marginTop: '1rem',
                  background: '#fee2e2',
                  padding: '12px',
                  borderRadius: '6px',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'start',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '1.2rem' }}>⚠️</div>
                <div style={{ flex: 1 }}>
                  <b>Erreur Fatale OCR</b>
                  <p style={{ margin: '5px 0 0 0' }}>{errorMessage}</p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#b91c1c',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* Logs - Only show when debug mode is active */}
            {debugMode && logs.length > 0 && (
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
            {debugMode && debugCrops.length > 0 && (
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
            {/* [NEW] MASTER AI BUTTON */}
            {candidates.some((c) => c.suggested_id || c.suggested_name || c.suggested_job) && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  padding: '10px 15px',
                  borderRadius: '8px',
                  marginBottom: '15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#d97706',
                    fontWeight: 'bold',
                  }}
                >
                  <FaMagic
                    className="magic-star-btn"
                    style={{ position: 'relative', transform: 'none', top: 0, right: 0 }}
                  />
                  Des corrections intelligentes sont disponibles.
                </div>
                <button
                  onClick={applyAllSuggestions}
                  className="btn btn-sm"
                  style={{
                    background: '#f59e0b',
                    color: 'white',
                    fontWeight: 'bold',
                    border: 'none',
                  }}
                >
                  Appliquer Tout
                </button>
              </div>
            )}

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
                    <th style={{ padding: '10px', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FaList /> Matricule
                      </div>
                    </th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FaUsers /> Nom
                      </div>
                    </th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FaArrowsAltH /> Service
                      </div>
                    </th>
                    {mode === 'worker' && (
                      <th style={{ padding: '10px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FaGlobeAfrica /> Lieu
                        </div>
                      </th>
                    )}
                    <th style={{ padding: '10px', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FaClipboardList /> {mode === 'worker' ? 'Poste' : 'Grade'}
                      </div>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {/* MATRICULE */}
                      <td style={{ padding: '8px' }}>
                        <div style={{ position: 'relative', width: '90px' }}>
                          <input
                            className="input"
                            value={c.national_id}
                            onChange={(e) => updateCandidate(c.id, 'national_id', e.target.value)}
                            style={{
                              width: '100%',
                              fontFamily: 'monospace',
                              paddingRight: c.suggested_id ? '25px' : '8px',
                              borderColor: c.suggested_id ? '#fde68a' : '#cbd5e1',
                            }}
                          />
                          {c.suggested_id && (
                            <button
                              className="magic-star-btn"
                              onClick={() => applySuggestion(c.id, 'national_id')}
                              title={`Correction IA : ${c.suggested_id}`}
                            >
                              <FaMagic />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* NOM ET PRÉNOM */}
                      <td
                        style={{
                          padding: '8px',
                          display: 'flex',
                          gap: '5px',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            className="input"
                            value={c.full_name}
                            onChange={(e) => {
                              const newVal = e.target.value;
                              updateCandidate(c.id, 'full_name', newVal);
                              updateCandidate(c.id, 'suggested_name', null); // Erase star if manual edit
                              if (c.is_viewing_ar) {
                                updateCandidate(c.id, 'original_ar', newVal);
                                if (c.isArabic) updateCandidate(c.id, 'manual_fr', '');
                              } else {
                                updateCandidate(c.id, 'manual_fr', newVal);
                                if (!c.isArabic) updateCandidate(c.id, 'original_ar', '');
                              }
                            }}
                            style={{
                              fontWeight: 'bold',
                              width: '100%',
                              paddingRight: c.suggested_name ? '25px' : '8px',
                              borderColor: c.suggested_name ? '#fde68a' : '#cbd5e1',
                            }}
                          />
                          {c.suggested_name && (
                            <button
                              className="magic-star-btn"
                              onClick={() => applySuggestion(c.id, 'full_name')}
                              title={`Correction IA : ${c.suggested_name}`}
                            >
                              <FaMagic />
                            </button>
                          )}
                        </div>

                        {/* TRANSLATION GLOBE (Restored to its true purpose) */}
                        <button
                          onClick={() => {
                            if (c.is_viewing_ar) {
                              const targetFr = c.manual_fr || transliterateArToFr(c.full_name);
                              updateCandidate(c.id, 'full_name', targetFr);
                              updateCandidate(c.id, 'is_viewing_ar', false);
                            } else {
                              const targetAr = c.original_ar || transliterateFrToAr(c.full_name);
                              updateCandidate(c.id, 'full_name', targetAr);
                              updateCandidate(c.id, 'is_viewing_ar', true);
                            }
                          }}
                          className="btn btn-outline btn-sm"
                          title={c.is_viewing_ar ? 'Traduire en Français' : 'Traduire en Arabe'}
                          style={{
                            padding: '4px 8px',
                            borderColor: (c.isArabic ? c.manual_fr : c.original_ar)
                              ? '#10b981'
                              : '#3b82f6',
                            color: (c.isArabic ? c.manual_fr : c.original_ar)
                              ? '#10b981'
                              : '#3b82f6',
                          }}
                        >
                          <FaGlobeAfrica />
                        </button>
                      </td>

                      {/* SERVICE */}
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

                      {/* LIEU DE TRAVAIL (Worker Only) */}
                      {mode === 'worker' && (
                        <td style={{ padding: '8px' }}>
                          <select
                            className="input"
                            value={c.workplace_id}
                            onChange={(e) => updateCandidate(c.id, 'workplace_id', e.target.value)}
                          >
                            <option value="">-</option>
                            {workplaces.map((wp) => (
                              <option key={wp.id} value={wp.id}>
                                {wp.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* POSTE */}
                      <td style={{ padding: '8px' }}>
                        <div style={{ position: 'relative' }}>
                          <input
                            className="input"
                            value={c.job_info}
                            onChange={(e) => updateCandidate(c.id, 'job_info', e.target.value)}
                            style={{
                              paddingRight: c.suggested_job ? '25px' : '8px',
                              borderColor: c.suggested_job ? '#fde68a' : '#cbd5e1',
                            }}
                          />
                          {c.suggested_job && (
                            <button
                              className="magic-star-btn"
                              onClick={() => applySuggestion(c.id, 'job_info')}
                              title={`Correction IA : ${c.suggested_job}`}
                            >
                              <FaMagic />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* DELETE */}
                      <td style={{ padding: '8px' }}>
                        <button
                          onClick={() => removeCandidate(c.id)}
                          style={{
                            color: 'red',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
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
        {/* HELP OVERLAY WITH DICTIONARY & PRESETS */}
        {showHelp && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
          >
            <div
              style={{
                background: 'white',
                borderRadius: '8px',
                padding: '20px',
                maxWidth: '500px',
                width: '100%',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              }}
            >
              <h3
                style={{
                  color: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: 0,
                }}
              >
                <FaLightbulb /> Guide de Scan OCR
              </h3>

              {/* DEBUG TOGGLE BUTTON - Moved here from toolbar */}
              <div
                style={{
                  marginBottom: '15px',
                  padding: '10px',
                  background: debugMode ? '#fef3c7' : '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    color: debugMode ? '#f59e0b' : '#64748b',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={debugMode}
                    onChange={(e) => setDebugMode(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
                  />
                  <FaBug /> Mode Debug
                </label>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: '#64748b',
                    margin: '5px 0 0 28px',
                    marginTop: '5px',
                  }}
                >
                  Affiche les logs de la console OCR et les traces des cellules découpées.
                </p>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '15px 0' }} />
              <ul
                style={{
                  paddingLeft: '20px',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  color: '#334155',
                }}
              >
                <li style={{ marginBottom: '10px' }}>
                  <b>Les Lignes :</b> Placez les lignes <u>à l'intérieur</u> des cases.
                </li>
                <li style={{ marginBottom: '10px' }}>
                  <b>Papier :</b> La feuille doit être parfaitement plate.
                </li>
              </ul>

              <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }} />

              <h3
                style={{
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: 0,
                }}
              >
                <FaSave /> Mémoire IA (Dictionaire)
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '15px' }}>
                L'IA apprend de vos corrections. Chargez le dictionnaire complet (250+ noms) ou
                transférez votre mémoire.
              </p>

              <button
                onClick={applyDefaultDictionary}
                className="btn btn-success"
                style={{ width: '100%', marginBottom: '10px', background: '#059669' }}
              >
                <FaGlobeAfrica /> Appliquer Defaults Algériens
              </button>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button
                  onClick={exportDictionary}
                  className="btn btn-outline"
                  style={{ flex: 1, borderColor: '#10b981', color: '#10b981' }}
                >
                  Exporter
                </button>
                <label
                  className="btn btn-outline"
                  style={{
                    flex: 1,
                    borderColor: '#3b82f6',
                    color: '#3b82f6',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  Importer
                  <input
                    type="file"
                    accept=".json"
                    onChange={importDictionary}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }} />

              <h3
                style={{
                  color: '#8b5cf6',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: 0,
                }}
              >
                <FaSave /> Grilles Prédéfinies
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '15px' }}>
                Sauvegardez vos configurations de grille.
              </p>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button
                  onClick={saveGridPreset}
                  className="btn btn-outline"
                  style={{ flex: 1, borderColor: '#8b5cf6', color: '#8b5cf6' }}
                >
                  💾 Sauvegarder
                </button>
                <select
                  className="input"
                  style={{ flex: 1 }}
                  onChange={(e) => {
                    if (e.target.value) {
                      loadGridPreset(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Charger...
                  </option>
                  {Object.keys(JSON.parse(localStorage.getItem('ocr_grid_presets') || '{}')).map(
                    (name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    )
                  )}
                </select>
              </div>
              {Object.keys(JSON.parse(localStorage.getItem('ocr_grid_presets') || '{}')).length >
                0 && (
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '5px' }}>
                    Supprimer un preset:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {Object.keys(JSON.parse(localStorage.getItem('ocr_grid_presets') || '{}')).map(
                      (name) => (
                        <button
                          key={name}
                          onClick={() => deleteGridPreset(name)}
                          className="btn btn-sm"
                          style={{
                            border: '1px solid #ef4444',
                            color: '#ef4444',
                            padding: '2px 6px',
                            fontSize: '0.7rem',
                          }}
                        >
                          <FaTrash /> {name}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowHelp(false)}
                className="btn btn-primary"
                style={{ width: '100%', fontWeight: 'bold' }}
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
